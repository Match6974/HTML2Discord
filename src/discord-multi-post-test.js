import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const secret = process.env.DISCORD_TEST_WEBHOOK_URL;
if (!secret) throw new Error('DISCORD_TEST_WEBHOOK_URL is missing');
let url;
try { url = new URL(secret); } catch { throw new Error('Invalid webhook URL'); }
if (url.origin !== 'https://discord.com' || !/^\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(url.pathname)) throw new Error('Unexpected webhook URL');
url.search = '';
url.searchParams.set('wait','true');

const MAX_FILES = 10;
const MAX_BATCH_BYTES = 8 * 1024 * 1024;
function plan(images) {
  const sorted = [...images].sort((a,b)=>a.page-b.page);
  assert.deepEqual(sorted.map(x=>x.page),sorted.map((_,i)=>i+1),'Missing or duplicate pages');
  const batches=[];
  let batch=[], bytes=0;
  for (const image of sorted) {
    assert(image.png.length <= MAX_BATCH_BYTES,'PNG exceeds test size budget');
    if (batch.length===MAX_FILES || bytes+image.png.length>MAX_BATCH_BYTES) {
      batches.push(batch); batch=[]; bytes=0;
    }
    batch.push(image); bytes+=image.png.length;
  }
  if(batch.length) batches.push(batch);
  return batches;
}
async function post(label,batch,total) {
  const names=batch.map(x=>x.name);
  const form=new FormData();
  form.append('payload_json',JSON.stringify({
    content: label+' | Pages '+batch[0].page+'–'+batch.at(-1).page+' / '+total,
    allowed_mentions:{parse:[]},
    attachments:names.map((filename,id)=>({id,filename}))
  }));
  batch.forEach((x,i)=>form.append('files['+i+']',new Blob([x.png],{type:'image/png'}),x.name));
  let response;
  try { response=await fetch(url,{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(30000)}); }
  catch { throw new Error('Discord request failed; check channel before rerunning'); }
  if(!response.ok) throw new Error('Discord returned HTTP '+response.status+'; check channel before rerunning');
  const result=await response.json();
  assert(result.id,'Missing Discord message ID');
  assert.deepEqual(result.attachments?.map(x=>x.filename),names,'Discord attachment order/count mismatch');
  console.log(label+': HTTP '+response.status+', message '+result.id+', '+names.join(', '));
}
const browser=await chromium.launch({headless:true});
const images=[];
try {
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  for(let n=1;n<=12;n++){
    await page.setContent('<html><body style="margin:0;background:#172033;color:white;display:grid;place-items:center;height:100vh;font:80px sans-serif"><main>HTML2Discord<br>Page '+n+'</main></body></html>');
    const png=await page.screenshot({type:'png'});
    images.push({page:n,name:'page-'+String(n).padStart(2,'0')+'.png',png});
  }
} finally {await browser.close();}
const cases=[
 ['TEST01',images.slice(0,3),[3]],
 ['TEST02',[images[2],images[0],images[1]],[3]],
 ['TEST03',images,[10,2]]
];
const plans=cases.map(([label,input,expected])=>{
 const batches=plan(input);
 assert.deepEqual(batches.map(x=>x.length),expected,label+' batch sizes');
 return {label,batches,total:input.length};
});
assert.throws(()=>plan([images[0],images[0]]));
for(const {label,batches,total} of plans){
 for(const batch of batches){
   await post(label,batch,total);
   await new Promise(resolve=>setTimeout(resolve,1100));
 }
}
console.log('Discord multi PNG post tests passed');
