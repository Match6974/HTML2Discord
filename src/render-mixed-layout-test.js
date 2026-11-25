import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createAdaptiveRenderer,fits} from './adaptive-renderer.js';
const dir='output/mixed-layout';
await mkdir(dir,{recursive:true});
const article={date:'2026.11.25',category:'混在配置テスト',characters:Array.from({length:8},(_,i)=>({name:'キャラクター '+(i+1),style:'テストスタイル',skills:[{title:'技α',display:{segments:[{scope:'',label:'強化',displayColor:'#16A34A',mode:'text',raw:'ダメージを増加'}]}}]}))};
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 const draw=await createAdaptiveRenderer(page,article);
 const rowsFor=(widths,offset=0)=>widths.map(width=>Array.from({length:width},()=>({i:offset++,start:0,end:1})));
 const report=[];
 async function capture(name,rows,n=1,total=1){
  const info=await draw(rows,n,total);
  const geometry=await page.evaluate(()=>({counts:[...document.querySelectorAll('.columns')].map(r=>r.children.length),gaps:[...document.querySelectorAll('.columns')].flatMap(r=>{const rects=[...r.children].map(e=>e.getBoundingClientRect());return rects.slice(1).map((v,i)=>v.left-rects[i].right);}),rowGaps:[...document.querySelectorAll('.columns')].map(e=>e.getBoundingClientRect()).slice(1).map((r,i)=>r.top-document.querySelectorAll('.columns')[i].getBoundingClientRect().bottom)}));
  report.push({name,...info,...geometry});
  await writeFile(dir+'/results.json',JSON.stringify(report,null,2));
  const png=await page.screenshot({path:dir+'/'+name+'.png'});
  assert.ok(fits(info),JSON.stringify(info));assert.deepEqual(geometry.counts,rows.map(r=>r.length));assert.ok([...geometry.gaps,...geometry.rowGaps].every(g=>g>=23.99));assert.deepEqual(info.ids,rows.flat().map(x=>x.i+':0'));assert.equal(info.segments,rows.flat().length);assert.equal(png.readUInt32BE(16),1920);assert.equal(png.readUInt32BE(20),1080);
  return info.ids;
 }
 for(const widths of [[1,2],[1,3],[2,3],[3,1]])await capture(widths.join('-'),rowsFor(widths));
 const first=rowsFor([1,3]);const next=rowsFor([2,2],4);
 const combined=await draw([...first,...next]);
 assert.ok(!fits(combined),'Expected four rows to exceed page bounds');
 const ids=[...await capture('pagination-01',first,1,2),...await capture('pagination-02',next,2,2)];
 assert.deepEqual(ids,article.characters.map((_,i)=>i+':0'));
 await writeFile(dir+'/result.json',JSON.stringify({status:'ok',cases:5,pages:6,overflowRejected:true},null,2));
}finally{await browser.close();}
