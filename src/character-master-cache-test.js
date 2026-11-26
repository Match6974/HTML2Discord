import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareMaster} from './prepare-character-master.js';
const now=1800000000000,day=86400000;
const old=[{characterId:1,nameJa:'テスト',styles:[{styleId:'Variant-0',nameJa:'オリジナル',ready:true,releaseStatus:'listed',imageUrl:'https://jp.ultrarumble.com/assets/Character/test.png'}]}];
const fresh=structuredClone(old);fresh[0].styles.push({...old[0].styles[0],styleId:'Variant-1',nameJa:'新スタイル'});
const cases=[
 {name:'initial',empty:true,status:'refreshed',reason:'cache-missing'},
 {name:'hit',age:day-1,status:'cache-hit'},
 {name:'expiry',age:day,status:'refreshed',reason:'expired'},
 {name:'manual',force:true,status:'refreshed',reason:'manual'},
 {name:'missing-style',targets:[{name:'テスト',style:'新スタイル'}],status:'refreshed',reason:'missing-target'},
 {name:'stale-fallback',force:true,fail:true,status:'stale-fallback',reason:'manual'},
 {name:'no-master',empty:true,fail:true,status:'no-master',reason:'cache-missing'},
 {name:'corrupt',force:true,corrupt:true,status:'stale-fallback',reason:'manual'}
];
for(const c of cases){
 const root=await mkdtemp(join(tmpdir(),'portrait-cache-'));
 try{
  const cache=join(root,'cache'),dir=join(root,'master');await mkdir(cache);
  const stamp=now-(c.age??1000);
  if(!c.empty){await writeFile(join(cache,'master.json'),JSON.stringify(old));await writeFile(join(cache,'timestamp'),String(stamp));}
  let calls=0;
  const result=await prepareMaster({cache,dir,now:()=>now,force:!!c.force,getTargets:async()=>c.targets??[],build:async()=>{
   calls++;
   await writeFile(join(dir,'master.json'),c.corrupt?'invalid json':JSON.stringify(fresh));
   await writeFile(join(dir,'result.json'),JSON.stringify({characters:1,styles:2,ready:2,warnings:0}));
   return {status:c.fail?1:0};
  }});
  assert.equal(result.status,c.status,c.name);
  assert.equal(calls,c.status==='cache-hit'?0:1);
  if(c.reason)assert.ok(result.reasons.includes(c.reason));else assert.deepEqual(result.reasons,[]);
  if(c.status==='no-master'){
   await assert.rejects(access(join(dir,'master.json')));await assert.rejects(access(join(cache,'master.json')));
  }else{
   const expected=c.status==='refreshed'?fresh:old;
   for(const folder of [cache,dir])assert.deepEqual(JSON.parse(await readFile(join(folder,'master.json'),'utf8')),expected);
   assert.equal(await readFile(join(cache,'timestamp'),'utf8'),String(c.status==='refreshed'?now:stamp));
  }
  assert.deepEqual(JSON.parse(await readFile(join(dir,'cache-result.json'),'utf8')),result);
  console.log('PASS',c.name);
 }finally{await rm(root,{recursive:true,force:true});}
}
console.log('All 8 cache cases passed');
