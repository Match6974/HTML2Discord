import assert from 'node:assert/strict';
import {postSequence} from './discord-delivery.js';
const overview={message:{embeds:[{title:'test'}]},images:[]};
const images={message:{content:'1–4 / 4ページ'},total:4,images:[1,2,3,4].map(page=>({page,name:'page-'+page+'.png',png:Buffer.from('test')}))};
async function run(statuses,payloads=[overview,images]){
 let calls=0,state,waits=[];
 const fetcher=async(url,opts)=>{
  const status=statuses[calls++];
  if(status==='timeout')throw new Error('timeout');
  const p=JSON.parse(opts.body.get('payload_json'));
  return {status,ok:status===200,json:async()=>status===429?{retry_after:0.5}:{id:String(calls),attachments:p.attachments}};
 };
 let error;
 try{await postSequence('https://example.invalid',payloads,{fetcher,sleep:async ms=>waits.push(ms),save:async s=>{state=structuredClone(s);}});}catch(e){error=e;}
 return {calls,state,waits,error};
}
let r=await run([200,200]);assert.equal(r.state.status,'ok');assert.equal(r.state.sent.length,2);
r=await run([200,429,200]);assert.equal(r.calls,3);assert.deepEqual(r.waits,[600]);assert.equal(r.state.sent.length,2);
r=await run([429,429,429,429]);assert.equal(r.calls,4);assert.equal(r.state.error.kind,'retry-exhausted');
for(const status of [400,401,403,404,500,503,'timeout']){
 r=await run([200,status,200],[overview,images,images]);assert.equal(r.calls,2);assert.equal(r.state.sent.length,1);assert.equal(r.state.status,status==='timeout'||status>=500?'uncertain':'failed');
}
r=await run([200,413,200,200]);assert.equal(r.state.status,'ok');assert.deepEqual(r.state.sent.map(x=>x.pages),[[],[1,2],[3,4]]);
r=await run([413],[{...images,images:[images.images[0]]}]);assert.equal(r.calls,1);assert.equal(r.state.error.kind,'too-large');
r=await run([200,413,200,503]);assert.equal(r.state.status,'uncertain');assert.deepEqual(r.state.sent.map(x=>x.pages),[[],[1,2]]);
console.log('Discord delivery tests passed');
