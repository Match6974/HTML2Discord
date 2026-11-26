import test from "node:test";
import assert from "node:assert/strict";
import { ArticleRepository } from "./article-state.js";

// In-memory adapter: unit tests only, not a Cloudflare persistence test.
function setup() {
  const map = new Map();
  let tail = Promise.resolve();
  const storage = {
    get: async key => structuredClone(map.get(key)),
    put: async (key, value) => { map.set(key, structuredClone(value)); },
    transaction: fn => {
      const result = tail.then(() => fn(storage));
      tail = result.catch(() => {});
      return result;
    }
  };
  return new ArticleRepository(storage);
}
const article = { articleId: "1589", articleUrl: "https://mhaur.bn-ent.net/news/?p=1589", destination: "test" };
test("register and retrieve, duplicate does not overwrite", async () => {
  const repo = setup();
  const first = await repo.register(article);
  assert.equal(first.created, true);
  assert.equal(first.state.status, "pending");
  assert.deepEqual(await repo.get("1589", "test"), first.state);
  assert.deepEqual(await repo.register({...article, baseline:true}), {created:false,state:first.state});
});
test("destination isolation and baseline", async () => {
  const repo = setup();
  await repo.register(article);
  await repo.register({...article,destination:"production",baseline:true});
  assert.equal((await repo.get("1589","production")).status,"baseline");
  assert.equal((await repo.get("1589","test")).status,"pending");
  assert.equal(await repo.get("1590","test"),null);
});
test("reject invalid identity and URL", async () => {
  const repo = setup();
  for (const patch of [{articleId:"abc"},{destination:"other"},{articleUrl:"https://example.com/news/?p=1589"},{articleUrl:"https://mhaur.bn-ent.net/news/?p=1590"}]) {
    await assert.rejects(repo.register({...article,...patch}));
  }
});
const owner = {...article, workflowRunId:"100", workflowRunAttempt:1};
test("revision and transition validation", async () => {
  const repo = setup();
  await repo.register(article);
  const change = (expectedRevision,status) => repo.transition({...article,expectedRevision,status});
  await assert.rejects(change(0,"completed"),/Invalid transition/);
  await assert.rejects(change(0,"processing"),/not enabled/);
  assert.equal((await change(0,"failed")).revision,1);
  await assert.rejects(change(0,"pending"),/Revision conflict/);
  await change(1,"pending");
});
test("claim, ownership, renewal and release", async () => {
  const repo = setup();
  await repo.register(article);
  const claim = await repo.claim(owner);
  assert.equal(claim.acquired,true);
  const lock = {...article,lockToken:claim.lockToken};
  assert.equal(await repo.validateLock(lock),true);
  assert.equal(await repo.validateLock({...lock,lockToken:"wrong"}),false);
  await assert.rejects(repo.release({...lock,lockToken:"wrong",status:"failed"}),/Invalid or expired/);
  await assert.rejects(repo.renewLock({...lock,lockToken:"wrong"}),/Invalid or expired/);
  await assert.rejects(repo.transition({...article,expectedRevision:1,status:"failed"}),/not enabled/);
  assert.equal((await repo.renewLock(lock)).revision,2);
  await assert.rejects(repo.release({...lock,status:"completed"}),/Invalid release/);
  await repo.release({...lock,status:"failed",lastError:"parse error"});
  assert.equal(await repo.validateLock(lock),false);
  const retry = await repo.claim({...owner,workflowRunAttempt:2});
  assert.equal(retry.acquired,true);
  assert.notEqual(retry.lockToken,claim.lockToken);
  assert.equal((await repo.get("1589","test")).retryCount,1);
  await repo.release({...article,lockToken:retry.lockToken,status:"no-target"});
  assert.equal((await repo.claim(owner)).acquired,false);
});
test("simultaneous claims through serialized mock transaction", async () => {
  const repo = setup();
  await repo.register(article);
  const results = await Promise.all([repo.claim(owner),repo.claim({...owner,workflowRunId:"101"})]);
  assert.equal(results.filter(x=>x.acquired).length,1);
  assert.equal(results.find(x=>!x.acquired).reason,"locked");
});
test("independent article and destination, baseline blocked", async () => {
  const repo = setup();
  const other = {...article,articleId:"1590",articleUrl:"https://mhaur.bn-ent.net/news/?p=1590"};
  await repo.register(article);
  await repo.register(other);
  await repo.register({...article,destination:"production"});
  await repo.register({...other,destination:"production",baseline:true});
  for(const input of [owner,{...owner,...other},{...owner,destination:"production"}])
    assert.equal((await repo.claim(input)).acquired,true);
  assert.equal((await repo.claim({...owner,...other,destination:"production"})).reason,"baseline");
  await assert.rejects(repo.claim({...owner,workflowRunAttempt:0}),/Invalid workflow identity/);
});

const digest = "a".repeat(64);
async function posting(repo) {
  await repo.register(article);
  const claim = await repo.claim(owner);
  const lock = {...article,lockToken:claim.lockToken};
  await repo.startPosting({...lock,totalPages:2,payloadDigest:digest});
  return lock;
}
async function expire(repo) {
  const key = "test:1589";
  const state = await repo.get("1589","test");
  // Test-only fixture simulating time passing; no production bypass.
  await repo.storage.put(key,{...state,lockExpiresAt:new Date(0).toISOString()});
  return {...owner,expectedRevision:state.revision,workflowStatus:"completed"};
}
async function overview(repo,lock) {
  const state = await repo.beginPost({...lock,kind:"overview",pages:[]});
  await repo.confirmPost({...lock,operationId:state.pendingPost.operationId,messageId:"1001"});
}
test("posting sequence, ownership and completion",async()=>{
  const repo=setup(), lock=await posting(repo);
  await assert.rejects(repo.beginPost({...lock,kind:"pages",pages:[1]}),/Invalid post sequence/);
  await assert.rejects(repo.beginPost({...lock,lockToken:"wrong",kind:"overview",pages:[]}),/Invalid or expired/);
  const first=await repo.beginPost({...lock,kind:"overview",pages:[]});
  await assert.rejects(repo.beginPost({...lock,kind:"overview",pages:[]}),/pending/);
  await assert.rejects(repo.confirmPost({...lock,operationId:"wrong",messageId:"1001"}),/Invalid pending/);
  await assert.rejects(repo.release({...lock,status:"failed"}),/Invalid release state/);
  await repo.confirmPost({...lock,operationId:first.pendingPost.operationId,messageId:"1001"});
  await assert.rejects(repo.beginPost({...lock,kind:"pages",pages:[2]}),/Invalid post sequence/);
  const batch=await repo.beginPost({...lock,kind:"pages",pages:[1,2]});
  const done=await repo.confirmPost({...lock,operationId:batch.pendingPost.operationId,messageId:"1002"});
  assert.equal(done.status,"completed");
  assert.deepEqual(done.postedPages,[1,2]);
  assert.equal(done.lockToken,null);
  assert.equal((await repo.claim(owner)).reason,"completed");
});
test("expired processing requires confirmed ended attempt and unchanged revision",async()=>{
  const repo=setup(); await repo.register(article);
  const claim=await repo.claim(owner);
  const lock={...article,lockToken:claim.lockToken};
  assert.equal((await repo.recoverExpired({...owner,expectedRevision:1,workflowStatus:"completed"})).recovered,false);
  const recovery=await expire(repo);
  assert.equal(await repo.validateLock(lock),false);
  assert.equal((await repo.claim(owner)).reason,"locked");
  for(const patch of [{workflowStatus:"in_progress"},{workflowStatus:null},{workflowRunAttempt:2},{expectedRevision:0}])
    assert.equal((await repo.recoverExpired({...recovery,...patch})).recovered,false);
  assert.deepEqual(await repo.recoverExpired(recovery),{recovered:true,status:"failed"});
  assert.equal((await repo.claim({...owner,workflowRunAttempt:2})).acquired,true);
});
test("unconfirmed post remains uncertain and cannot be reclaimed",async()=>{
  const repo=setup(),lock=await posting(repo);
  await repo.beginPost({...lock,kind:"overview",pages:[]});
  assert.deepEqual(await repo.recoverExpired(await expire(repo)),{recovered:true,status:"uncertain"});
  assert.equal((await repo.claim(owner)).reason,"uncertain");
  assert.ok((await repo.get("1589","test")).pendingPost);
});
test("confirmed partial progress resumes only with same plan",async()=>{
  const repo=setup(),lock=await posting(repo);
  await overview(repo,lock);
  const batch=await repo.beginPost({...lock,kind:"pages",pages:[1]});
  await repo.confirmPost({...lock,operationId:batch.pendingPost.operationId,messageId:"1002"});
  assert.deepEqual(await repo.recoverExpired(await expire(repo)),{recovered:true,status:"failed"});
  const claim=await repo.claim({...owner,workflowRunAttempt:2});
  const retry={...article,lockToken:claim.lockToken};
  await assert.rejects(repo.startPosting({...retry,totalPages:2,payloadDigest:"b".repeat(64)}),/Posting plan conflict/);
  await repo.startPosting({...retry,totalPages:2,payloadDigest:digest});
  await assert.rejects(repo.beginPost({...retry,kind:"pages",pages:[1]}),/Invalid post sequence/);
  const next=await repo.beginPost({...retry,kind:"pages",pages:[2]});
  const done=await repo.confirmPost({...retry,operationId:next.pendingPost.operationId,messageId:"1003"});
  assert.equal(done.status,"completed");
  assert.deepEqual(done.postedPages,[1,2]);
  assert.equal(done.sentMessages.length,3);
});
