import { createHash } from 'node:crypto';
import { postSequence } from './discord-delivery.js';

function fingerprint(payloads){
 const hash=createHash('sha256');
 for(const p of payloads){
  hash.update(JSON.stringify([p.message,p.total,(p.images??[]).map(x=>[x.page,x.name,createHash('sha256').update(x.png).digest('hex')])]));
 }
 return hash.digest('hex');
}
export async function deliverArticle({articleId,destination,payloads,store,...options}){
 if(!/^\d+$/.test(String(articleId))||!['test','production'].includes(destination))throw new Error('Invalid article identity');
 const key=destination+':'+articleId;
 const pages=payloads.flatMap(p=>(p.images??[]).map(x=>x.page));
 if(payloads.length<2||(payloads[0].images??[]).length||payloads.slice(1).some(p=>!p.images?.length)||!pages.length||pages.some((p,i)=>p!==i+1))throw new Error('Invalid posting plan');
 const digest=fingerprint(payloads);
 // Store must serialize access to this key across the entire operation.
 return store.withLock(key,async()=>{
  const previous=await store.load(key);
  if(previous?.status==='completed')return {status:'skipped',reason:'completed'};
  if(previous&&!['pending','failed'].includes(previous.status))return {status:'blocked',reason:'uncertain-or-invalid-state'};
  if(previous&&previous.digest!==digest)return {status:'blocked',reason:'plan-changed'};
  const sent=previous?.sent??[];
  const done=sent.flatMap(x=>x.pages);
  const overview=sent.some(x=>x.kind==='overview');
  if(done.some((p,i)=>p!==i+1)||done.length>pages.length||(!overview&&done.length))throw new Error('Invalid saved progress');
  const remaining=payloads.flatMap((p,i)=>{
   if(i===0)return overview?[]:[p];
   const images=p.images.filter(x=>x.page>done.length);
   if(!images.length)return [];
   return [{...p,images,message:images.length===p.images.length?p.message:{...p.message,content:images[0].page+'–'+images.at(-1).page+' / '+pages.length+'ページ'}}];
  });
  const base={articleId:String(articleId),destination,digest};
  if(!remaining.length){await store.save(key,{...base,status:'completed',sent,pending:null,error:null});return {status:'completed'};}
  await store.save(key,{...base,status:'posting',sent,pending:null,error:null});
  const result=await postSequence(options.url,remaining,{...options,save:async state=>{
   await store.save(key,{...base,...state,status:state.status==='ok'?'completed':state.status,sent:[...sent,...state.sent]});
  }});
  return {...result,status:'completed',sent:[...sent,...result.sent]};
 });
}
