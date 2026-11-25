import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {buildPatchNoteHtml} from './patch-note-html.js';

const dir='output/two-column';
await mkdir(dir,{recursive:true});
const skill=(title,raw)=>({title,display:{segments:[{scope:'',label:'強化',displayColor:'#16A34A',mode:'text',raw}]}});
const characters=[
 {name:'テストキャラクター A',style:'スタイル A',skills:[skill('技α','ダメージを増加'),skill('技β','リロード速度を増加'),skill('技γ','低レベル時のダメージを増加')]},
 {name:'テストキャラクター B',style:'スタイル B',skills:[skill('技α','ダメージを増加')]}
];
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 for(const [name,counts] of [['balanced',[2,2]],['uneven',[3,1]],['long-text',[1,1]]]){
  const article={date:'2026.11.25',category:'2列配置テスト',characters:characters.map((c,i)=>({...c,skills:Array.from({length:counts[i]},(_,j)=>name==='long-text'?skill('技α','低レベル時と高レベル時のダメージ差を調整し、発動時の追従距離と速度を変更するテスト文章です。'):c.skills[j%c.skills.length])}))};
  const html=buildPatchNoteHtml({article,characterIndex:0});
  await page.goto('about:blank');
  await page.setContent(html);
  await page.waitForFunction(()=>window.renderReady===true);
  const blocks=[];
  for(let i=0;i<2;i++){
   await page.goto('about:blank');
   await page.setContent(buildPatchNoteHtml({article,characterIndex:i}));
   await page.waitForFunction(()=>window.renderReady===true);
   // Use unpaginated template markup, not the selected page's subset.
   const markup=buildPatchNoteHtml({article,characterIndex:i});
   blocks.push(await page.evaluate(markup=>{
    const doc=new DOMParser().parseFromString(markup,'text/html');
    return [...doc.querySelectorAll('.character-header,.skill-card')].map(e=>e.outerHTML).join('');
   },markup));
  }
  await page.goto('about:blank');
  await page.setContent(html.replace(/<script>[\s\S]*?<\/script>/,''));
  await page.evaluate(blocks=>{
   const root=document.querySelector('.page');
   root.querySelectorAll('.character-header,.skill-card,.reason-card').forEach(e=>e.remove());
   const grid=document.createElement('div');grid.className='columns';
   for(const block of blocks){const col=document.createElement('section');col.className='character-column';col.innerHTML=block;grid.append(col);}
   root.append(grid);
   const css=document.createElement('style');
   css.textContent='.columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;align-items:start}.character-column{display:flex;flex-direction:column;gap:16px;min-width:0}.character-column .character-header{padding:16px 20px}.character-column .character-name{font-size:42px;overflow-wrap:anywhere}.character-column .skill-card{padding:18px}.character-column .skill-title{font-size:32px;overflow-wrap:anywhere}.character-column .segment-header{margin-top:8px}.character-column .raw-text{font-size:30px;white-space:pre-line}.character-column .value-row{flex-wrap:wrap}';
   document.head.append(css);
  },blocks);
  await page.evaluate(()=>document.fonts.ready);
  const report=await page.evaluate(()=>{
   const cols=[...document.querySelectorAll('.character-column')];
   const cards=[...document.querySelectorAll('.skill-card')];
   const footer=document.querySelector('footer').getBoundingClientRect();
   const rects=cols.map(e=>e.getBoundingClientRect());
   return {columns:cols.length,counts:cols.map(e=>e.querySelectorAll('.skill-card').length),cards:cards.length,footerGap:footer.top-Math.max(...rects.map(r=>r.bottom)),columnGap:rects[1].left-rects[0].right,overflow:[...document.querySelectorAll('.character-column,.skill-card,.raw-text,.skill-title')].some(e=>e.scrollWidth>e.clientWidth+1),right:Math.max(...rects.map(r=>r.right))};
  });
  await writeFile(dir+'/'+name+'.json',JSON.stringify(report,null,2));
  assert.equal(report.columns,2);assert.deepEqual(report.counts,counts);assert.ok(report.footerGap>=24);assert.ok(report.columnGap>=24);assert.ok(!report.overflow);assert.ok(report.right<=1872);
  const png=await page.screenshot({path:dir+'/'+name+'.png'});
  assert.equal(png.readUInt32BE(16),1920);assert.equal(png.readUInt32BE(20),1080);
 }
}finally{await browser.close();}
