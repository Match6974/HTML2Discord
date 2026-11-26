import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {sendDiscord} from './discord-delivery.js';
import {articleClient} from './durable-article-client.js';
import {createHash} from 'node:crypto';
const dir='output/news-portrait',out='output/discord';
await mkdir(out,{recursive:true});
const read=async name=>JSON.parse(await readFile(dir+'/'+name,'utf8'));
const result=await read('result.json');
const url=new URL(result.url);
assert.equal(url.origin,'https://mhaur.bn-ent.net');
assert.equal(url.pathname,'/news/');
const articleId=url.searchParams.get('p');assert.match(articleId,/^\d+$/);
const repeat=process.env.REPEAT_TEST==='true';
const destination=process.env.DELIVERY_DESTINATION||'test';
assert.ok(['test','production'].includes(destination));
assert.ok(!repeat||destination==='test');
const api=articleClient(articleId,destination);
let lockToken;
if(!repeat){
await api('register',{articleUrl:url.href});
const claim=await api('claim',{workflowRunId:process.env.GITHUB_RUN_ID,workflowRunAttempt:Number(process.env.GITHUB_RUN_ATTEMPT)});
if(!claim.acquired){console.log('Article skipped:',claim.reason);process.exit(0);}
lockToken=claim.lockToken;
}
let posting=false;
try {
if(result.status==='no-target'){
 if(!repeat)await api('release',{lockToken,status:'no-target'});
 await writeFile(out+'/integration-result.json',JSON.stringify({status:'skipped',reason:'no-target',articleId},null,2));
 console.log('No balance adjustments: Discord posting skipped');
}else{
 assert.equal(result.status,'ok');assert.ok(Number.isInteger(result.total)&&result.total>0);
 const data=await read('data.json'),dates=await read('date-candidates.json'),layout=await read('layout-results.json');
 assert.equal(data.status,'ok');assert.equal(dates.dates.length,1);assert.equal(layout.length,result.total);
 assert.equal(result.fallbackPages,0);
 const ids=layout.flatMap(x=>x.ids);assert.equal(ids.length,result.cards);assert.equal(new Set(ids).size,ids.length);
 const files=(await readdir(dir)).filter(x=>/^page-\d+\.png$/.test(x));assert.equal(files.length,result.total);
 const images=[];
 for(let page=1;page<=result.total;page++){
  const name='page-'+String(page).padStart(2,'0')+'.png',png=await readFile(dir+'/'+name);
  assert.equal(png.readUInt32BE(16),1920);assert.equal(png.readUInt32BE(20),1080);assert.ok(png.length<=8*1024*1024);
  images.push({page,name,png});
 }
 const browser=await chromium.launch();let title;
 try{
  const page=await browser.newPage({javaScriptEnabled:false});await page.route('**/*',r=>r.abort());
  await page.setContent(await readFile(dir+'/source.html','utf8'),{waitUntil:'domcontentloaded'});
  title=await page.evaluate(()=>document.querySelector('meta[property="og:title"]')?.content?.trim()||document.querySelector('h1')?.textContent?.trim()||document.title.trim());
 }finally{await browser.close();}
 assert.ok(title,'NEWS title missing');
 const webhook=new URL((destination==='production'?process.env.DISCORD_PRODUCTION_WEBHOOK_URL:process.env.DISCORD_TEST_WEBHOOK_URL)??'https://invalid.invalid');
 assert.ok(webhook.origin==='https://discord.com'&&/^\/api\/webhooks\/\d+\/[\w-]+$/.test(webhook.pathname),'Invalid test webhook');
 webhook.search='?wait=true';
 const payloads=[{message:{content:destination==='production'?'【バトルスタイル調整】':'【結合テスト】',embeds:[{author:{name:'MY HERO ULTRA RUMBLE'},title:(dates.dates[0]+' バトルスタイル調整').slice(0,256),url:url.href,description:title.slice(0,1000)+'\nバランス調整の内容を画像にまとめました。',color:0x5865F2,fields:[{name:'対象スタイル・キャラクター枠',value:String(data.characters.length),inline:true},{name:'調整項目',value:String(data.characters.reduce((n,c)=>n+c.adjustments.length,0)+(data.shared??[]).reduce((n,g)=>n+(g.kind==='general'?g.adjustments.length:1),0)),inline:true}],footer:{text:'HTML2Discord | 全'+result.total+'ページ'}}]},images:[]}];
 let batch=[],bytes=0;
 function flush(){if(!batch.length)return;payloads.push({message:{content:'Page '+batch[0].page+'–'+batch.at(-1).page+' / '+result.total},images:batch,total:result.total});batch=[];bytes=0;}
 for(const image of images){if(batch.length===10||bytes+image.png.length>8*1024*1024)flush();batch.push(image);bytes+=image.png.length;}flush();
 if(repeat){
  for(const payload of payloads)await sendDiscord(webhook.href,payload);
  console.log('Repeat test Discord delivery completed');
  await writeFile(out+'/integration-result.json',JSON.stringify({articleId,status:'completed',pages:result.total,repeat:true},null,2));
 }else{
 const hash=createHash('sha256');
 for(const payload of payloads){
  hash.update(JSON.stringify(payload.message));
  for(const image of payload.images){hash.update(image.name);hash.update(image.png);}
 }
 const payloadDigest=hash.digest('hex');
 await api('startPosting',{lockToken,totalPages:result.total,payloadDigest});
 posting=true;
 let state=await api('get');
 for(const payload of payloads){
  const pages=payload.images.map(x=>x.page);
  if(!pages.length&&state.overviewPosted)continue;
  if(pages.length&&pages.every(p=>state.postedPages.includes(p)))continue;
  if(pages.some(p=>state.postedPages.includes(p)))throw Error('Partial batch conflict');
  await api('renewLock',{lockToken});
  const pending=await api('beginPost',{lockToken,kind:pages.length?'pages':'overview',pages});
  const messageId=await sendDiscord(webhook.href,payload);
  state=await api('confirmPost',{lockToken,operationId:pending.pendingPost.operationId,messageId});
 }
 assert.equal(state.status,'completed');
 await writeFile(out+'/integration-result.json',JSON.stringify({articleId,status:'completed',pages:result.total},null,2));
 console.log('Durable Discord delivery completed');
 }
}
}catch(e){
 if(!repeat&&!posting)await api('release',{lockToken,status:'failed',lastError:'Preparation failed'}).catch(()=>{});
 throw e;
}
