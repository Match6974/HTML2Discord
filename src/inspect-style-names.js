import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='output/style-name-inspect';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch();
const results=[];
try{
 for(const [lang,origin] of [['ja','https://jp.ultrarumble.com'],['en','https://ultrarumble.com']]){
  const page=await browser.newPage();
  const pending=[],network=[];
  let budget=12000000;
  page.on('response',r=>{
   const type=r.request().resourceType();
   if(!['script','xhr','fetch'].includes(type))return;
   const entry={url:r.url(),status:r.status(),type};network.push(entry);
   if(network.length>100||!r.ok())return;
   if(!['ultrarumble.com','jp.ultrarumble.com','www.ultrarumble.com'].includes(new URL(r.url()).hostname))return;
   pending.push((async()=>{try{
    const body=await r.text();
    if(body.length>budget)return;
    budget-=body.length;
    const matches=[...body.matchAll(/フェアリー|fairy|2501|Variant-1/gi)].slice(0,30).map(m=>body.slice(Math.max(0,m.index-150),m.index+200));
    entry.matches=matches;
    if(matches.length||type!=='script'){entry.file=lang+'-response-'+network.indexOf(entry)+'.txt';await writeFile(dir+'/'+entry.file,body);}
   }catch(e){entry.error=String(e);}})());
  });
  try{
   const r=await page.goto(origin+'/character/25',{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForTimeout(2500);
   const data=await page.evaluate(()=>({url:location.href,title:document.title,text:document.body.innerText,styles:[...document.querySelectorAll('.ch-style,[id^="Variant-"]')].map(e=>({id:e.id,heading:e.querySelector('.ch-style-name')?.textContent,header:e.querySelector('header')?.outerHTML,attributes:[...e.attributes].map(a=>[a.name,a.value])})),scripts:[...document.scripts].map(s=>({src:s.src,type:s.type,text:s.src?'':s.textContent})),links:[...document.querySelectorAll('a[href]')].map(a=>({text:a.innerText,url:a.href}))}));
   await writeFile(dir+'/'+lang+'.html',await page.content());
   await Promise.allSettled(pending);
   await writeFile(dir+'/'+lang+'.json',JSON.stringify({...data,network},null,2));
   results.push({lang,status:r?.status(),url:data.url,styles:data.styles.map(s=>({id:s.id,heading:s.heading})),network:network.length});
  }catch(e){results.push({lang,error:String(e)});}
  finally{await page.close();}
 }
 await writeFile(dir+'/result.json',JSON.stringify(results,null,2));
 if(results.some(r=>r.status!==200))throw Error('One or more language pages failed');
}finally{await browser.close();}
