import { DurableObject } from "cloudflare:workers";
import { ArticleRepository } from "./article-state.js";
import { fetchNews, dispatchNews } from "./news-monitor.js";
const STATE_PATH = "/internal/article-state";
const STATE_NAME = "article-delivery-v1";
const STATE_ACTIONS = ["register","claim","renewLock","release","startPosting","beginPost","confirmPost","get"];
const MONITOR_NAME = "news-monitor-preview-v1";
const MONITOR_PATH = "/internal/monitor";

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

const CONCURRENCY_PATH = "/internal/test/concurrency";
const concurrencyName = run => "internal-concurrency-test:"+run;
const validRun = run => typeof run === "string" && /^[a-f0-9]{32}$/.test(run);
const validCase = n => Number.isInteger(n) && n >= 1 && n <= 5;
async function concurrencyTest(repo, storage, body) {
  const {action, n, destination, attempt} = body;
  const input = {...fixture(String(910000000+n)),destination};
  const claim = () => repo.claim({...input,workflowRunId:String(attempt),workflowRunAttempt:1});
  const check = (condition) => { if (!condition) throw new Error("Test assertion failed"); };
  if (action === "cleanup") { await storage.deleteAll(); return {empty:(await storage.list()).size===0}; }
  if (action === "register") { const r=await repo.register(input); return {created:r.created}; }
  if (action === "claim") { const r=await claim(); return {acquired:r.acquired,reason:r.reason}; }
  const state=await repo.get(input.articleId,destination);
  check(state && state.lockToken);
  const lock={...input,lockToken:state.lockToken};
  if (action === "wrong-token") {
    const before=JSON.stringify(state);
    let rejected=false;
    try { await repo.renewLock({...lock,lockToken:"invalid"}); }
    catch(e) { rejected=e.message==="Invalid or expired lock"; }
    check(rejected && before===JSON.stringify(await repo.get(input.articleId,destination)));
    return {passed:true};
  }
  if (action === "release") {
    await repo.release({...lock,status:"failed"});
    return {passed:true};
  }
  if (action === "expire" || action === "uncertain") {
    if(action==="uncertain"){
      await repo.startPosting({...lock,totalPages:1,payloadDigest:"b".repeat(64)});
      await repo.beginPost({...lock,kind:"overview",pages:[]});
    }
    const s=await repo.get(input.articleId,destination);
    await storage.put(destination+":"+input.articleId,{...s,lockExpiresAt:new Date(0).toISOString()});
    check(!(await claim()).acquired && !await repo.validateLock(lock));
    if(action==="uncertain"){
      const recovery={...input,expectedRevision:s.revision,workflowRunId:s.workflowRunId,workflowRunAttempt:s.workflowRunAttempt};
      check(!(await repo.recoverExpired({...recovery,workflowStatus:"in_progress"})).recovered);
      check((await repo.recoverExpired({...recovery,workflowStatus:"completed"})).status==="uncertain");
      check(!(await claim()).acquired);
    }
    return {passed:true};
  }
  if(action==="complete"){
    await repo.startPosting({...lock,totalPages:1,payloadDigest:"c".repeat(64)});
    let s=await repo.beginPost({...lock,kind:"overview",pages:[]});
    await repo.confirmPost({...lock,operationId:s.pendingPost.operationId,messageId:"2001"});
    s=await repo.beginPost({...lock,kind:"pages",pages:[1]});
    await repo.confirmPost({...lock,operationId:s.pendingPost.operationId,messageId:"2002"});
    check((await repo.get(input.articleId,destination)).status==="completed" && !(await claim()).acquired);
    return {passed:true};
  }
  throw new Error("Invalid action");
}

export class ArticleState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.repository = new ArticleRepository(ctx.storage);
    this.storage = ctx.storage;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if(path===STATE_PATH && request.method==="POST"){
      if(this.ctx.id.toString()!==this.env.ARTICLE_STATE.idFromName(STATE_NAME).toString()) return json({status:"forbidden"},403);
      const {action,input}=await request.json();
      if(!STATE_ACTIONS.includes(action)||input?.destination!=="test") return json({status:"invalid-action"},400);
      try {
        const result=action==="get"?await this.repository.get(input.articleId,input.destination):await this.repository[action](input);
        if(action==="claim") return json({status:"ok",result});
        const sanitize=s=>s&&typeof s==="object"?Object.fromEntries(Object.entries(s).filter(([k])=>k!=="lockToken").map(([k,v])=>[k,k==="state"?sanitize(v):v])):s;
        return json({status:"ok",result:sanitize(result)});
      } catch(e){return json({status:"error",detail:String(e?.message??"Unknown error").slice(0,200)},409);}
    }
    if (path === MONITOR_PATH && request.method === "POST") {
      if(this.ctx.id.toString()!==this.env.ARTICLE_STATE.idFromName(MONITOR_NAME).toString()) return json({status:"forbidden"},403);
      const {action}=await request.json();
      let ids;
      try { ids=await fetchNews(); } catch(e) {
        const message=String(e?.message??"Unknown error");
        return json({status:"error",stage:"fetch-news",detail:message.slice(0,300)},502);
      }
      if(action==="dispatch-test"){
        try { await dispatchNews(this.env,ids[0]); } catch(e) {
          return json({status:"error",stage:"dispatch",detail:String(e?.message??"Unknown error").slice(0,300)},502);
        }
        return json({status:"ok",articleId:ids[0],dispatched:true});
      }
      let result;
      try { result=await this.storage.transaction(async tx=>{
        const seen=await tx.get("seen");
        const known=new Set(seen??[]);
        const enabled=this.env.AUTO_TEST_DELIVERY==="true";
        const active=await tx.get("delivery-enabled");
        const fresh=enabled&&active&&seen?ids.filter(id=>!known.has(id)):[];
        await tx.put("delivery-enabled",enabled);
        await tx.put("seen",[...new Set([...known,...ids])]);
        return {baseline:!seen,detected:fresh,articleCount:ids.length};
      });
      } catch(e) { return json({status:"error",stage:"storage",detail:String(e?.message??"Unknown error").slice(0,300)},500); }
      const failures=[];
      for(const id of result.detected){
        try { await dispatchNews(this.env,id,true); }
        catch(e){ failures.push(id); console.error("NEWS dispatch failed",id,String(e?.message??"error")); }
      }
      console.log("NEWS preview",JSON.stringify({...result,failures}));
      if(failures.length)return json({status:"error",stage:"dispatch",failedIds:failures},502);
      return json({status:"ok",...result});
    }
    if (path === CONCURRENCY_PATH && request.method === "POST") {
      const body=await request.json();
      if (!validRun(body.run) || this.ctx.id.toString() !== this.env.ARTICLE_STATE.idFromName(concurrencyName(body.run)).toString())
        return json({status:"forbidden"},403);
      return json(await concurrencyTest(this.repository,this.storage,body));
    }
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
  async scheduled(controller,env,ctx) {
    const stub=env.ARTICLE_STATE.get(env.ARTICLE_STATE.idFromName(MONITOR_NAME));
    ctx.waitUntil((async()=>{
      const response=await stub.fetch("https://internal"+MONITOR_PATH,{method:"POST",body:JSON.stringify({action:"scan"})});
      if(!response.ok) throw new Error("NEWS scan failed: "+response.status);
    })());
  },
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if(path===STATE_PATH){
      if(request.method!=="POST") return json({status:"method-not-allowed"},405);
      if(!await authorized(request,env)) return json({status:"unauthorized"},401);
      try {
        const raw=await request.text();
        if(raw.length>8192) return json({status:"invalid-request"},400);
        const {action,input}=JSON.parse(raw);
        if(!STATE_ACTIONS.includes(action)||input?.destination!=="test") return json({status:"invalid-action"},400);
        const stub=env.ARTICLE_STATE.get(env.ARTICLE_STATE.idFromName(STATE_NAME));
        return await stub.fetch("https://internal"+STATE_PATH,{method:"POST",body:JSON.stringify({action,input})});
      }catch{return json({status:"state-error"},500);}
    }
    if (path === MONITOR_PATH) {
      if(request.method!=="POST") return json({status:"method-not-allowed"},405);
      if(!await authorized(request,env)) return json({status:"unauthorized"},401);
      try {
        const raw=await request.text();
        if(raw.length>128) return json({status:"invalid-request"},400);
        const {action}=JSON.parse(raw);
        if(!["scan","dispatch-test"].includes(action)) return json({status:"invalid-action"},400);
        const stub=env.ARTICLE_STATE.get(env.ARTICLE_STATE.idFromName(MONITOR_NAME));
        return await stub.fetch("https://internal"+MONITOR_PATH,{method:"POST",body:JSON.stringify({action})});
      } catch(e) { return json({status:"monitor-error",stage:"worker-to-object",detail:String(e?.message??"Unknown error").slice(0,300)},500); }
    }
    if (path === CONCURRENCY_PATH) {
      if (request.method !== "POST") return json({status:"method-not-allowed"},405);
      if (!await authorized(request,env)) return json({status:"unauthorized"},401);
      try {
        const raw=await request.text();
        if(raw.length>512) return json({status:"invalid-request"},400);
        const b=JSON.parse(raw);
        if(!validRun(b?.run) || !validCase(b.n) || !["test","production"].includes(b.destination) ||
          !Number.isInteger(b.attempt) || b.attempt<1 || b.attempt>100 ||
          !["register","claim","wrong-token","release","expire","uncertain","complete","cleanup"].includes(b.action))
          return json({status:"invalid-request"},400);
        const stub=env.ARTICLE_STATE.get(env.ARTICLE_STATE.idFromName(concurrencyName(b.run)));
        return await stub.fetch("https://internal"+CONCURRENCY_PATH,{method:"POST",body:JSON.stringify(b)});
      } catch { return json({status:"test-error"},500); }
    }
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
