import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir,rename,rm,appendFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='output/portrait-regression';
await mkdir(root,{recursive:true});
const cases=[['1573','ok',24,26],['1563','ok'],['1552','ok',117,117],['1485','ok'],['1566','no-target'],['1528','no-target']];
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const results=[];
for(const [id,expected,cards,segments] of cases){
 const url='https://mhaur.bn-ent.net/news/?p='+id;
 const env={...process.env,NEWS_URL:url};
 const t=performance.now(),errors=[];
 let result=null,profile=null,baseline=null,warnings=null;
 const dest=root+'/p'+id;
 await rm('output/news-portrait',{recursive:true,force:true});
 await rm('output/news-general',{recursive:true,force:true});
 await mkdir(dest,{recursive:true});
 for(const [script,folder,label] of [['render-news-general','news-general','baseline'],['render-news-portrait','news-portrait','portrait']]){
  const run=spawnSync(process.execPath,['src/'+script+'.js'],{env,stdio:'inherit',timeout:300000});
  if(run.status!==0)errors.push(label+' failed: '+(run.error?.message??run.signal??run.status));
  try{await rename('output/'+folder,dest+'/'+label);}catch(e){errors.push(label+' output missing: '+e.message);}
 }
 try{
  result=await read(dest+'/portrait/result.json');baseline=await read(dest+'/baseline/result.json');
  assert.equal(result.url,url);assert.equal(baseline.url,url);
  assert.equal(result.status,expected);assert.equal(baseline.status,expected);
  const files=(await readdir(dest+'/portrait')).filter(f=>/^page-\d+\.png$/.test(f));
  if(expected==='ok'){
   assert.equal(result.cards,baseline.cards);assert.equal(result.segments,baseline.segments);
   if(cards!==undefined)assert.equal(result.cards,cards);
   if(segments!==undefined)assert.equal(result.segments,segments);
   assert.equal(result.fallbackPages,0);assert.ok(result.total>0);assert.equal(files.length,result.total);
   const layouts=await read(dest+'/portrait/layout-results.json');
   assert.equal(layouts.length,result.total);
   const ids=layouts.flatMap(p=>p.ids);assert.equal(ids.length,result.cards);assert.equal(new Set(ids).size,ids.length);
   for(const p of layouts){assert.ok(p.footerGap>=24);assert.ok(p.right<=1872.01);assert.equal(p.overflow.length,0);}
   for(const f of files){const b=await readFile(dest+'/portrait/'+f);assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(b.readUInt32BE(16),1920);assert.equal(b.readUInt32BE(20),1080);}
   const images=await read(dest+'/portrait/image-results.json');warnings=images.warnings;assert.ok(images.downloaded.length>0,'No portraits downloaded');
   assert.equal(warnings.length,0,'Portrait warnings: '+JSON.stringify(warnings));
   profile=await read(dest+'/portrait/performance.json');
  }else{assert.equal(result.pages,0);assert.equal(baseline.pages,0);assert.equal(files.length,0);}
 }catch(e){errors.push(String(e));}
 const entry={id,url,expected,status:errors.length?'failed':'passed',result,baseline,profile,warnings,elapsedMs:Math.round(performance.now()-t),errors};
 results.push(entry);await writeFile(dest+'/comparison.json',JSON.stringify(entry,null,2));
}
await writeFile(root+'/summary.json',JSON.stringify(results,null,2));
const table=['| NEWS | Status | Baseline pages | Portrait pages | Cards | Segments | Render ms |','|---|---|---:|---:|---:|---:|---:|',...results.map(r=>'| '+[r.id,r.status,r.baseline?.total??r.baseline?.pages??'-',r.result?.total??r.result?.pages??'-',r.result?.cards??'-',r.result?.segments??'-',r.profile?.total??'-'].join(' | ')+' |')].join('\n');
console.log(table);
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,table+'\n');
if(results.some(r=>r.errors.length))process.exitCode=1;
