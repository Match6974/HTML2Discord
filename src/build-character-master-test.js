import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='output/character-master';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage();
const origins={ja:'https://jp.ultrarumble.com',en:'https://ultrarumble.com'};
const warnings=[],master=[];
const save=(name,data)=>writeFile(dir+'/'+name+'.json',JSON.stringify(data,null,2));
async function visit(url){
 const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
 if(!r?.ok())throw Error('HTTP '+r?.status()+' '+url);
 await page.waitForTimeout(700);
}
async function list(origin){
 await visit(origin+'/characters');
 await page.waitForSelector('a.cl-card',{timeout:15000});
 return page.locator('a.cl-card').evaluateAll(es=>es.map(e=>({url:e.href,name:e.querySelector('.cl-txt b')?.textContent.trim()??'',owner:e.querySelector('.cl-of')?.textContent.trim()??'',text:e.innerText})));
}
async function detail(origin,id){
 await visit(origin+'/character/'+id);
 return page.evaluate(()=>[...document.querySelectorAll('.ch-style')].map(e=>({id:e.id,name:e.querySelector('.ch-style-name')?.textContent.trim()??'',image:e.querySelector('img.ch-style-art')?.src??'',text:e.querySelector('header')?.innerText??''})));
}
try{
 const lists={ja:await list(origins.ja),en:await list(origins.en)};
 await save('lists',lists);
 const ids=lang=>[...new Set(lists[lang].map(c=>new URL(c.url)).filter(u=>u.origin===origins[lang]&&/^\/character\/\d+$/.test(u.pathname)).map(u=>u.pathname.split('/').at(-1)))];
 const jaIds=ids('ja'),enIds=ids('en');
 if(!jaIds.length||!enIds.length)throw Error('Empty character list');
 for(const id of new Set([...jaIds,...enIds])){
  const raw={ja:[],en:[]};
  for(const lang of ['ja','en']){
   try{if(!ids(lang).includes(id))throw Error('Missing list entry');raw[lang]=await detail(origins[lang],id);if(!raw[lang].length)throw Error('No style elements');}
   catch(e){warnings.push({id,lang,issue:String(e)});}
   await page.waitForTimeout(500);
  }
  const name=lang=>lists[lang].find(c=>{const u=new URL(c.url);return u.pathname==='/character/'+id&&!u.hash;})?.name||null;
  const styles=[];
  for(const styleId of new Set([...raw.ja,...raw.en].map(s=>s.id))){
   const j=raw.ja.filter(s=>s.id===styleId),e=raw.en.filter(s=>s.id===styleId);
   if(!styleId||j.length!==1||e.length!==1){warnings.push({id,styleId,issue:'Missing or ambiguous style ID'});continue;}
   const a=j[0],b=e[0];
   const sameImage=!!a.image&&!!b.image&&new URL(a.image).pathname===new URL(b.image).pathname;
   const nameJa=a.name||(styleId==='Variant-0'&&b.name.toLowerCase()==='original'?'オリジナル':null);
   if(!sameImage||!b.name||!nameJa)warnings.push({id,styleId,issue:'Unresolved metadata',sameImage,nameEn:b.name,nameJa});
   styles.push({styleId,nameJa,nameEn:b.name||null,imageUrl:a.image||null,imagePathMatches:sameImage,ready:!!(nameJa&&name('ja')&&sameImage&&b.name),nameJaSource:a.name?'page':nameJa?'original-rule':null});
  }
  master.push({characterId:Number(id),nameJa:name('ja'),nameEn:name('en'),styles,raw});
  await save('master',master);await save('warnings',warnings);
 }
 await save('result',{characters:master.length,styles:master.reduce((n,c)=>n+c.styles.length,0),ready:master.reduce((n,c)=>n+c.styles.filter(s=>s.ready).length,0),warnings:warnings.length});
}finally{await browser.close();}
