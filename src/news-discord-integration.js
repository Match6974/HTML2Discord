import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {deliverArticle} from './discord-article-delivery.js';
const dir='output/news-portrait',out='output/discord';
await mkdir(out,{recursive:true});
const read=async name=>JSON.parse(await readFile(dir+'/'+name,'utf8'));
const result=await read('result.json');
const url=new URL(result.url);
assert.equal(url.origin,'https://mhaur.bn-ent.net');
assert.equal(url.pathname,'/news/');
const articleId=url.searchParams.get('p');assert.match(articleId,/^\d+$/);
if(result.status==='no-target'){
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
 const webhook=new URL(process.env.DISCORD_TEST_WEBHOOK_URL??'https://invalid.invalid');
 assert.ok(webhook.origin==='https://discord.com'&&/^\/api\/webhooks\/\d+\/[\w-]+$/.test(webhook.pathname),'Invalid test webhook');
 webhook.search='?wait=true';
 const payloads=[{message:{content:'【結合テスト】',embeds:[{author:{name:'MY HERO ULTRA RUMBLE'},title:(dates.dates[0]+' バトルスタイル調整').slice(0,256),url:url.href,description:title.slice(0,1000)+'\nバランス調整の内容を画像にまとめました。',color:0x5865F2,fields:[{name:'対象スタイル・キャラクター枠',value:String(data.characters.length),inline:true},{name:'調整項目',value:String(data.characters.reduce((n,c)=>n+c.adjustments.length,0)+(data.shared??[]).reduce((n,g)=>n+(g.kind==='general'?g.adjustments.length:1),0)),inline:true}],footer:{text:'HTML2Discord | 全'+result.total+'ページ'}}]},images:[]}];
 let batch=[],bytes=0;
 function flush(){if(!batch.length)return;payloads.push({message:{content:'Page '+batch[0].page+'–'+batch.at(-1).page+' / '+result.total},images:batch,total:result.total});batch=[];bytes=0;}
 for(const image of images){if(batch.length===10||bytes+image.png.length>8*1024*1024)flush();batch.push(image);bytes+=image.png.length;}flush();
 const records=new Map();
 const store={withLock:async(k,fn)=>fn(),load:async k=>records.get(k),save:async(k,state)=>{records.set(k,structuredClone(state));await writeFile(out+'/post-result.json',JSON.stringify(state,null,2));}};
 const args={articleId,destination:'test',payloads,store,url:webhook.href};
 const first=await deliverArticle(args);assert.equal(first.status,'completed');
 const second=await deliverArticle(args);assert.equal(second.status,'skipped');
 await writeFile(out+'/integration-result.json',JSON.stringify({articleId,status:'completed',pages:result.total,messages:first.sent.length,duplicate:second.status},null,2));
 console.log('NEWS Discord integration passed; duplicate skipped');
}
