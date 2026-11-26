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
async function postOverview(label,total) {
  const payload={
    content: '【表示テスト】'+label,
    embeds: [{
      color: 0x5865F2,
      author: {name:'MY HERO ULTRA RUMBLE'},
      title: '2026/11/11 バトルスタイル調整',
      url: 'https://mhaur.bn-ent.net/news/?p=1573',
      description: 'バランス調整の内容を画像にまとめました。\\n[公式NEWSはこちら](https://mhaur.bn-ent.net/news/?p=1573)'.replace('\\n','\n'),
      fields: [{name:'対象スタイル',value:'8スタイル',inline:true},{name:'調整項目',value:'24件',inline:true}],
      footer: {text:'HTML2Discord | 全'+total+'ページ（表示テスト）'}
    }],
    allowed_mentions:{parse:[]}
  };
  let response;
  try { response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(30000)}); }
  catch { throw new Error('Discord overview request failed; check channel before rerunning'); }
  if(!response.ok) throw new Error('Discord overview returned HTTP '+response.status);
  const result=await response.json();
  assert(result.id,'Missing overview message ID');
  assert.equal(result.embeds?.length,1);
  assert.equal(result.embeds[0].title,'2026/11/11 バトルスタイル調整');
  assert.equal(result.attachments?.length,0);
  console.log('Overview posted: HTTP '+response.status+', message '+result.id);
}
async function post(label,batch,total) {
  const names=batch.map(x=>x.name);
  const form=new FormData();
  form.append('payload_json',JSON.stringify({
    content: '【表示テスト】'+label+' | '+batch[0].page+'–'+batch.at(-1).page+' / '+total+'ページ',
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
  assert.equal(result.embeds?.length ?? 0,0,'Unexpected embed on image message');
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
const cases=[['EMBED TEST',images,[10,2]]];
const plans=cases.map(([label,input,expected])=>{
 const batches=plan(input);
 assert.deepEqual(batches.map(x=>x.length),expected,label+' batch sizes');
 return {label,batches,total:input.length};
});
assert.throws(()=>plan([images[0],images[0]]));
for(const {label,batches,total} of plans){
 await postOverview(label,total);
 await new Promise(resolve=>setTimeout(resolve,1100));
 for(const batch of batches){
   await post(label,batch,total);
   await new Promise(resolve=>setTimeout(resolve,1100));
 }
}
console.log('Discord embed post test passed');
