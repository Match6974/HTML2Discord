import { DurableObject } from "cloudflare:workers";
import { ArticleRepository } from "./article-state.js";

const TEST_NAME = "internal-persistence-test-v1";
const TEST_PATH = "/internal/test/persistence";
const fixture = id => ({articleId:id, destination:"test", articleUrl:"https://mhaur.bn-ent.net/news/?p="+id});
const json = (body,status=200) => Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
async function authorized(request, env) {
  const secret = env.ARTICLE_STATE_TEST_TOKEN;
  const header = request.headers.get("Authorization") ?? "";
  if (typeof secret !== "string" || secret.length < 32 || header.length > 512) return false;
  const hash = s => crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  const [a,b] = await Promise.all([hash(header),hash("Bearer "+secret)]);
  return crypto.subtle.timingSafeEqual(a,b);
}

export class ArticleState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.repository = new ArticleRepository(ctx.storage);
    this.storage = ctx.storage;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/health") return json({status:"ok",service:"ArticleState"});
    if (path !== TEST_PATH || request.method !== "POST") return json({status:"not-found"},404);
    if (this.ctx.id.toString() !== this.env.ARTICLE_STATE.idFromName(TEST_NAME).toString())
      return json({status:"forbidden"},403);
    const {action} = await request.json();
    const repo = this.repository;
    const a = fixture("900000001"), b = fixture("900000002");
    const snapshot = async () => {
      const states = await Promise.all([a,b].map(x=>repo.get(x.articleId,x.destination)));
      return states.map(s=>s && ({...s,lockToken:undefined,hasLock:Boolean(s.lockToken)}));
    };
    if (action === "cleanup") {
      await this.storage.deleteAll();
      return json({status:"ok",states:await snapshot()});
    }
    if (action === "seed") {
      if ((await snapshot()).some(Boolean)) return json({status:"already-seeded"},409);
      const first = await repo.register(a);
      const duplicate = await repo.register({...a,baseline:true});
      if (!first.created || duplicate.created || duplicate.state.status !== "pending") throw new Error("register");
      const claim = await repo.claim({...a,workflowRunId:"1",workflowRunAttempt:1});
      const lock = {...a,lockToken:claim.lockToken};
      await repo.startPosting({...lock,totalPages:2,payloadDigest:"a".repeat(64)});
      let s = await repo.beginPost({...lock,kind:"overview",pages:[]});
      await repo.confirmPost({...lock,operationId:s.pendingPost.operationId,messageId:"1001"});
      s = await repo.beginPost({...lock,kind:"pages",pages:[1]});
      await repo.confirmPost({...lock,operationId:s.pendingPost.operationId,messageId:"1002"});
      await repo.register(b);
      const c = await repo.claim({...b,workflowRunId:"2",workflowRunAttempt:1});
      await repo.release({...b,lockToken:c.lockToken,status:"failed",lastError:"synthetic failure"});
      return json({status:"ok",states:await snapshot()});
    }
    if (action === "read" || action === "verify") {
      const states = await snapshot();
      const [x,y] = states;
      const valid = x?.status === "posting" && x.hasLock && x.overviewPosted &&
        x.postedPages.length === 1 && x.postedPages[0] === 1 && x.totalPages === 2 &&
        x.pendingPost === null && x.sentMessages.length === 2 &&
        y?.status === "failed" && !y.hasLock && y.lastError === "synthetic failure";
      return json({status:action === "verify" && !valid ? "invalid":"ok",states},action === "verify" && !valid ? 409:200);
    }
    return json({status:"invalid-action"},400);
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === TEST_PATH) {
      if (request.method !== "POST") return json({status:"method-not-allowed"},405);
      if (!await authorized(request,env)) return json({status:"unauthorized"},401);
      try {
        const raw = await request.text();
        if (raw.length > 256) return json({status:"invalid-request"},400);
        const body = JSON.parse(raw);
        if (!["seed","read","verify","cleanup"].includes(body?.action)) return json({status:"invalid-action"},400);
        const stub = env.ARTICLE_STATE.get(env.ARTICLE_STATE.idFromName(TEST_NAME));
        return await stub.fetch("https://internal"+TEST_PATH,{method:"POST",body:JSON.stringify({action:body.action})});
      } catch {
        return json({status:"test-error"},500);
      }
    }
    if (path !== "/") return json({status:"not-found"},404);
    const articleStateBound = Boolean(env.ARTICLE_STATE);
    if (!articleStateBound) return json({status:"error",articleStateBound},503);
    const stub = env.ARTICLE_STATE.get(env.ARTICLE_STATE.idFromName("health-check"));
    const response = await stub.fetch("https://internal/health");
    return json({status:response.ok?"ok":"error",service:"mhaur-patchnote-discord",
      articleStateBound,articleStateReachable:response.ok},response.ok?200:503);
  }
};
