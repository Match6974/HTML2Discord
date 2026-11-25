import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='output/character-catalog-inspect';
const origin='https://jp.ultrarumble.com';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage();
const details=[],errors=[];
try{
 const response=await page.goto(origin+'/characters',{waitUntil:'domcontentloaded',timeout:30000});
 if(!response?.ok())throw Error('Character list HTTP failure');
 await page.waitForSelector('a.cl-card',{timeout:15000});
 const cards=await page.locator('a.cl-card').evaluateAll(es=>es.map(e=>({url:e.href,text:e.innerText,html:e.outerHTML,images:[...e.querySelectorAll('img')].map(i=>({url:i.currentSrc||i.src,alt:i.alt}))})));
 await writeFile(dir+'/list.json',JSON.stringify(cards,null,2));
 const paths=[...new Set(cards.map(c=>new URL(c.url)).filter(u=>u.origin===origin&&/^\/character\/\d+$/.test(u.pathname)).map(u=>u.pathname))];
 if(!paths.length)throw Error('No character links found');
 for(const path of paths){
  const requests=[];
  const listener=r=>{if(requests.length<200&&['xhr','fetch','script'].includes(r.request().resourceType()))requests.push({url:r.url(),status:r.status(),type:r.request().resourceType()});};
  page.on('response',listener);
  try{
   const r=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:30000});
   if(!r?.ok())throw Error('HTTP '+r?.status());
   await page.waitForTimeout(700);
   const data=await page.evaluate(()=>({title:document.title,text:document.body.innerText,styles:[...document.querySelectorAll('.ch-style-art')].map(e=>({html:e.outerHTML,context:e.parentElement?.parentElement?.outerHTML.slice(0,30000)})),anchors:[...document.querySelectorAll('[id]')].filter(e=>/variant|style/i.test(e.id)).map(e=>({id:e.id,text:e.innerText?.slice(0,3000)})),scripts:[...document.scripts].map(s=>({src:s.src,type:s.type,text:s.src?'':s.textContent.slice(0,100000)})),images:[...document.images].map(i=>({url:i.currentSrc||i.src,alt:i.alt}))}));
   const id=path.split('/').at(-1);
   await writeFile(dir+'/character-'+id+'.html',await page.content());
   details.push({id,path,...data,requests});
  }catch(e){errors.push({path,error:String(e)});}
  finally{page.off('response',listener);}
  await page.waitForTimeout(500);
 }
 await writeFile(dir+'/details.json',JSON.stringify(details,null,2));
 await writeFile(dir+'/result.json',JSON.stringify({cards:cards.length,characters:paths.length,inspected:details.length,errors},null,2));
 if(errors.length)throw Error('Some character pages failed');
}catch(e){await writeFile(dir+'/error.txt',String(e.stack??e));throw e;}finally{await browser.close();}
