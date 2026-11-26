import {readFile,writeFile,mkdir,rm,rename,copyFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fetchNews} from './fetch-news.js';
import {parseNews} from './parse-news.js';
import {structureAdjustments} from './structure-adjustments.js';
import {match} from './match-character-images.js';
import {loadMaster} from './portrait-image-loader.js';
const cache='output/master-cache',dir='output/character-master';
await mkdir(cache,{recursive:true});await mkdir(dir,{recursive:true});
const cached=await loadMaster([cache+'/master.json'],[]);
let stamp=0;try{stamp=Number(await readFile(cache+'/timestamp','utf8'));}catch{}
const reasons=[];
if(!cached.length)reasons.push('cache-missing');
if(!Number.isFinite(stamp)||stamp>Date.now()||Date.now()-stamp>=86400000)reasons.push('expired');
if(process.env.FORCE_MASTER==='true')reasons.push('manual');
if(cached.length&&!reasons.length){
 const {html}=await fetchNews(process.env.NEWS_URL);
 const parsed=await parseNews(html);
 if(parsed.status==='ok'){
  const data=structureAdjustments(parsed);
  const targets=[...data.characters.flatMap(c=>c.adjustments.map(a=>({name:c.name,style:c.style,styleScope:a.styleScope}))),...(data.shared??[]).flatMap(g=>g.targets??[])];
  for(const t of targets){
   if(!t.style&&t.styleScope!=='all')continue;
   if(match(t.name,t.style,t.styleScope,cached).warnings.some(w=>/missing or ambiguous|Upcoming style|Unavailable style/.test(w))){reasons.push('missing-target');break;}
  }
 }
}
let status='cache-hit';
if(reasons.length){
 await rm(dir,{recursive:true,force:true});await mkdir(dir,{recursive:true});
 const run=spawnSync(process.execPath,['src/build-character-master-test.js'],{stdio:'inherit',timeout:600000});
 const fresh=await loadMaster([dir+'/master.json'],[]);
 let result=null;try{result=JSON.parse(await readFile(dir+'/result.json','utf8'));}catch{}
 const valid=run.status===0&&fresh.length>0&&result?.characters===fresh.length&&result.styles===fresh.reduce((n,c)=>n+c.styles.length,0)&&result.ready===result.styles&&result.warnings===0&&(!cached.length||fresh.length>=cached.length);
 if(valid){
  await copyFile(dir+'/master.json',cache+'/master.tmp');await rename(cache+'/master.tmp',cache+'/master.json');
  await writeFile(cache+'/timestamp',String(Date.now()));status='refreshed';
 }else{
  await rm(dir+'/master.json',{force:true});status=cached.length?'stale-fallback':'no-master';
 }
}
if(status==='cache-hit'||status==='stale-fallback')await copyFile(cache+'/master.json',dir+'/master.json');
await writeFile(dir+'/cache-result.json',JSON.stringify({status,reasons,cachedCharacters:cached.length},null,2));
console.log('Master cache:',status,reasons);
