import { writeFile, mkdir } from 'node:fs/promises';
export class PostError extends Error {
  constructor(kind,status=null){super('Discord post: '+kind+(status?' HTTP '+status:''));this.kind=kind;this.status=status;}
}
export async function sendDiscord(url,payload,{fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),budget={remaining:3}}={}){
  for(;;){
    const form=new FormData();
    const images=payload.images??[];
    form.append('payload_json',JSON.stringify({...payload.message,allowed_mentions:{parse:[]},attachments:images.map((x,id)=>({id,filename:x.name}))}));
    images.forEach((x,i)=>form.append('files['+i+']',new Blob([x.png],{type:'image/png'}),x.name));
    let res;
    try{res=await fetcher(url,{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(30000)});}
    catch{throw new PostError('uncertain');}
    if(res.status===429){
      if(budget.remaining<=0)throw new PostError('retry-exhausted',429);
      let body;try{body=await res.json();}catch{}
      const raw=body?.retry_after??res.headers?.get('Retry-After');
      const seconds=raw==null?NaN:Number(raw);
      if(!Number.isFinite(seconds)||seconds<0||seconds>120)throw new PostError('rate-limit-wait-invalid-or-too-long',429);
      budget.remaining--;await sleep(Math.ceil(seconds*1000)+100);continue;
    }
    if(res.status===413)throw new PostError('too-large',413);
    if(!res.ok)throw new PostError(res.status>=500?'uncertain':'rejected',res.status);
    let result;try{result=await res.json();}catch{throw new PostError('uncertain',res.status);}
    if(!result.id||JSON.stringify(result.attachments?.map(x=>x.filename))!==JSON.stringify(images.map(x=>x.name)))throw new PostError('uncertain',res.status);
    return result.id;
  }
}
export async function postSequence(url,payloads,{save=async state=>{await mkdir('output/discord',{recursive:true});await writeFile('output/discord/post-result.json',JSON.stringify(state,null,2));},...options}={}){
  const state={status:'posting',sent:[],pending:null,error:null};
  async function post(payload,budget){
    const images=payload.images??[];
    state.pending={kind:images.length?'images':'overview',pages:images.map(x=>x.page)};
    await save(state);
    let id;
    try{id=await sendDiscord(url,payload,{...options,budget});}
    catch(e){
      if(e.kind==='too-large'&&images.length>1&&budget.remaining>0){
        budget.remaining--;
        const mid=Math.ceil(images.length/2);
        for(const part of [images.slice(0,mid),images.slice(mid)]){
          await post({...payload,images:part,message:{...payload.message,content:part[0].page+'–'+part.at(-1).page+' / '+payload.total+'ページ'}},budget);
        }
        return;
      }
      throw e;
    }
    state.sent.push({...state.pending,id});state.pending=null;await save(state);
  }
  try{
    for(const payload of payloads)await post(payload,{remaining:3});
    state.status='ok';await save(state);return state;
  }catch(e){
    state.status=e.kind==='uncertain'?'uncertain':'failed';
    state.error={kind:e.kind??'local-error',httpStatus:e.status??null};
    await save(state);throw e;
  }
}
