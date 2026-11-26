import {readFile} from 'node:fs/promises';
import {match} from './match-character-images.js';
export async function loadMaster(paths,warnings,read=readFile){
 for(const path of paths)try{
  const data=JSON.parse(await read(path,'utf8'));
  if(!Array.isArray(data)||!data.length||!data.every(c=>c&&typeof c.nameJa==='string'&&Array.isArray(c.styles)&&c.styles.every(s=>s&&typeof s.styleId==='string')))throw Error('Invalid master');
  return data;
 }catch(e){warnings.push({path,warning:String(e)});}
 return [];
}
export function createImageLoader(master,{fetcher=fetch,validate=async()=>{},delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const cache=new Map(),warnings=[];
 async function images(name,style,scope){
  let result;
  try{result=match(name,style,scope,master);}catch(e){warnings.push({name,style,warning:String(e)});return [];}
  warnings.push(...result.warnings.map(w=>({name,style,warning:w})));
  const out=[];
  for(const item of result.images){
   if(!cache.has(item.url)){
    let value=null;
    for(let attempt=1;attempt<=3;attempt++){
     try{
      const response=await fetcher(item.url,{redirect:'error',signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error('HTTP '+response.status);
      const b=Buffer.from(await response.arrayBuffer());
      if(b.length<24||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||b.toString('ascii',12,16)!=='IHDR'||!b.readUInt32BE(16)||!b.readUInt32BE(20))throw Error('Invalid PNG');
      const src='data:image/png;base64,'+b.toString('base64');
      await validate(src);value=src;break;
     }catch(e){warnings.push({url:item.url,attempt,warning:String(e)});if(attempt<3)await delay(500*attempt);}
    }
    cache.set(item.url,value);
   }
   if(cache.get(item.url))out.push(cache.get(item.url));
  }
  return out;
 }
 return {images,cache,warnings};
}
