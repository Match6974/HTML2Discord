import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='output/character-inspect';
await mkdir(dir,{recursive:true});
const origin='https://jp.ultrarumble.com';
const browser=await chromium.launch();
const page=await browser.newPage();
const results=[];
try{
 for(const path of ['/characters','/character/25']){
  const requests=[];
  const listener=r=>{if(requests.length<500)requests.push({url:r.url(),status:r.status(),type:r.request().resourceType()});};
  page.on('response',listener);
  const key=path.replaceAll('/','-').slice(1);
  try{
   const response=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForTimeout(2500);
   const data=await page.evaluate(()=>({title:document.title,text:document.body.innerText,links:[...document.querySelectorAll('a[href]')].map(a=>({text:a.innerText,url:a.href})),images:[...document.images].map(i=>({src:i.currentSrc||i.src,alt:i.alt,width:i.naturalWidth,height:i.naturalHeight})),buttons:[...document.querySelectorAll('button')].map(b=>({text:b.innerText,title:b.title})),scripts:[...document.scripts].map(s=>({src:s.src,type:s.type}))}));
   await writeFile(dir+'/'+key+'.html',await page.content());
   await writeFile(dir+'/'+key+'.json',JSON.stringify({status:response?.status(),...data,requests},null,2));
   results.push({path,status:response?.status(),images:data.images.length,links:data.links.length});
  }finally{page.off('response',listener);}
 }
 const assets=[];
 for(const id of ['2500','2501']){
  const url=origin+'/assets/Character/Ch025/GUI/Variation/T_ui_Thumb_13_'+id+'_L.png';
  const r=await page.request.get(url,{timeout:30000});
  const b=await r.body();
  const png=b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  assets.push({url,status:r.status(),contentType:r.headers()['content-type'],bytes:b.length,png,width:png?b.readUInt32BE(16):null,height:png?b.readUInt32BE(20):null});
 }
 await writeFile(dir+'/result.json',JSON.stringify({results,assets},null,2));
 if(results.some(r=>r.status!==200)||assets.some(a=>a.status!==200||!a.png))throw Error('Inspect HTTP or image failure; see result.json');
}catch(e){await writeFile(dir+'/error.txt',String(e.stack??e));throw e;}finally{await browser.close();}
