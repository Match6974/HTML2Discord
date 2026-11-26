import assert from 'node:assert/strict';
import {deliverArticle} from './discord-article-delivery.js';
const records=new Map(),locks=new Map();
const store={load:async k=>structuredClone(records.get(k)),save:async(k,v)=>records.set(k,structuredClone(v)),withLock:async(k,fn)=>{const prior=locks.get(k)??Promise.resolve();let release;const gate=new Promise(r=>release=r);locks.set(k,prior.then(()=>gate));await prior;try{return await fn();}finally{release();}}};
const payloads=[{message:{embeds:[{title:'test'}]},images:[]},{message:{content:'1–4 / 4ページ'},total:4,images:[1,2,3,4].map(page=>({page,name:'page-'+page+'.png',png:Buffer.from('test'+page)}))}];
let calls=0;
function run(id,statuses=[],extra={}){
 let i=0;
 return deliverArticle({articleId:id,destination:'test',payloads,store,url:'https://example.invalid',sleep:async()=>{},fetcher:async(url,opts)=>{calls++;const status=statuses[i++]??200;if(status==='timeout')throw Error('timeout');const p=JSON.parse(opts.body.get('payload_json'));return {status,ok:status===200,json:async()=>({id:String(calls),attachments:p.attachments})};},...extra});
}
assert.equal((await run(1)).status,'completed');let n=calls;assert.equal((await run(1)).status,'skipped');assert.equal(calls,n);
await assert.rejects(run(2,[200,400]));n=calls;assert.equal((await run(2)).status,'completed');assert.equal(calls,n+1);
await assert.rejects(run(3,[200,'timeout']));n=calls;assert.equal((await run(3)).status,'blocked');assert.equal(calls,n);
await assert.rejects(run(4,[200,413,200,400]));n=calls;assert.equal((await run(4)).status,'completed');assert.equal(calls,n+1);assert.deepEqual(records.get('test:4').sent.map(x=>x.pages),[[],[1,2],[3,4]]);
await assert.rejects(run(5,[200,400]));n=calls;assert.equal((await run(5,[],{payloads:[payloads[0],{...payloads[1],message:{content:'changed'}}]})).reason,'plan-changed');assert.equal(calls,n);
records.set('test:6',{...records.get('test:5'),status:'posting'});assert.equal((await run(6)).status,'blocked');
n=calls;assert.equal((await run(1,[],{destination:'production'})).status,'completed');assert.equal(calls,n+2);
n=calls;const results=await Promise.all([run(7),run(7)]);assert.deepEqual(results.map(x=>x.status),['completed','skipped']);assert.equal(calls,n+2);
console.log('Discord article delivery tests passed');
