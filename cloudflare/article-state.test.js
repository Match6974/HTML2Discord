import test from "node:test";
import assert from "node:assert/strict";
import { ArticleRepository } from "./article-state.js";

// In-memory adapter: unit tests only, not a Cloudflare persistence test.
function setup() {
  const map = new Map();
  const storage = {
    get: async key => structuredClone(map.get(key)),
    put: async (key, value) => { map.set(key, structuredClone(value)); },
    transaction: async fn => fn(storage)
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
test("revision and transition validation", async () => {
  const repo = setup();
  await repo.register(article);
  const change = (expectedRevision,status) => repo.transition({...article,expectedRevision,status});
  await assert.rejects(change(0,"completed"),/Invalid transition/);
  assert.equal((await change(0,"queued")).revision,1);
  await assert.rejects(change(0,"processing"),/Revision conflict/);
  await change(1,"processing");
  await assert.rejects(change(2,"posting"),/not enabled/);
  await change(2,"failed");
  await change(3,"processing");
  await change(4,"no-target");
  await assert.rejects(change(5,"pending"),/Invalid transition/);
});
