import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {buildPatchNoteHtml} from './patch-note-html.js';

const dir='output/three-column';
await mkdir(dir,{recursive:true});
const cases=[['balanced',[2,2,2]],['uneven',[3,1,2]],['long-text',[1,1,1]],['numeric',[1,1,1]],['long-names',[1,1,1]]];
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 for(const [name,counts] of cases){
  const article={date:'2026.11.25',category:'3列配置テスト',characters:counts.map((count,i)=>({
   name:name==='long-names'?'テスト用の非常に長いキャラクター名 '+(i+1):'キャラクター '+(i+1),
   style:name==='long-names'?'長いバトルスタイル名称の折り返し確認':'スタイル '+(i+1),
   skills:Array.from({length:count},(_,j)=>({
    title:name==='long-names'?'技α「非常に長い個性技の名称の折り返し確認」':'技'+['α','β','γ'][j],
    display:{segments:[name==='numeric'?{scope:'全レベル',label:i===2?'弱体化':'強化',displayColor:i===2?'#DC2626':'#16A34A',afterColor:i===2?'#DC2626':'#16A34A',before:i===0?null:i===1?1200:'1～100',after:i===0?300:i===1?1500:100,unit:i===2?'%':'',mode:'before-after',raw:'数値表示テスト'}:{scope:'',label:'強化',displayColor:'#16A34A',mode:'text',raw:name==='long-text'?'低レベル時と高レベル時のダメージ差を調整し、発動時の追従距離と速度を変更するテスト文章です。':'ダメージを増加'}]}
   }))
  }))};
  const templates=article.characters.map((_,i)=>buildPatchNoteHtml({article,characterIndex:i}));
  await page.goto('about:blank');
  await page.setContent(templates[0].replace(/<script>[\s\S]*?<\/script>/,''));
  await page.evaluate(templates=>{
   const root=document.querySelector('.page');
   root.querySelectorAll('.character-header,.skill-card,.reason-card').forEach(e=>e.remove());
   const grid=document.createElement('div');grid.className='columns';
   for(const markup of templates){
    const doc=new DOMParser().parseFromString(markup,'text/html');
    const col=document.createElement('section');col.className='character-column';
    for(const el of doc.querySelectorAll('.character-header,.skill-card'))col.append(document.importNode(el,true));
    grid.append(col);
   }
   root.append(grid);
   const css=document.createElement('style');
   css.textContent='.columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;align-items:start}.character-column{display:flex;flex-direction:column;gap:16px;min-width:0}.character-column .character-header{padding:16px 20px}.character-column .character-name{font-size:38px;overflow-wrap:anywhere}.character-column .battle-style{font-size:26px;overflow-wrap:anywhere}.character-column .skill-card{padding:18px;min-width:0}.character-column .skill-title{font-size:32px;overflow-wrap:anywhere}.character-column .segment-header{margin-top:8px;gap:12px;flex-wrap:wrap}.character-column .raw-text{font-size:30px;white-space:pre-line}.character-column .value-row{display:flex;flex-wrap:wrap;gap:12px}.character-column .value-before,.character-column .value-after{font-size:40px;max-width:100%;overflow-wrap:anywhere}.character-column .value-arrow{font-size:36px}';
   document.head.append(css);
  },templates);
  await page.evaluate(()=>document.fonts.ready);
  const report=await page.evaluate(()=>{
   const cols=[...document.querySelectorAll('.character-column')];
   const rects=cols.map(e=>e.getBoundingClientRect());
   const footer=document.querySelector('footer').getBoundingClientRect();
   const elements=[...document.querySelectorAll('.character-column,.character-header,.character-name,.battle-style,.skill-card,.skill-title,.raw-text,.segment-header,.value-row,.value-before,.value-arrow,.value-after')];
   return {columns:cols.length,counts:cols.map(e=>e.querySelectorAll('.skill-card').length),names:cols.map(e=>e.querySelector('.character-name').textContent.trim()),footerGap:footer.top-Math.max(...rects.map(r=>r.bottom)),columnGaps:rects.slice(1).map((r,i)=>r.left-rects[i].right),overflow:elements.filter(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1).map(e=>e.className),right:Math.max(...rects.map(r=>r.right)),values:[...document.querySelectorAll('.value-row')].map(e=>[...e.children].map(x=>x.textContent.trim()))};
  });
  await writeFile(dir+'/'+name+'.json',JSON.stringify(report,null,2));
  const png=await page.screenshot({path:dir+'/'+name+'.png'});
  assert.equal(report.columns,3);assert.deepEqual(report.counts,counts);assert.deepEqual(report.names,article.characters.map(c=>c.name));assert.ok(report.footerGap>=24,JSON.stringify(report));assert.ok(report.columnGaps.every(g=>g>=23.99));assert.deepEqual(report.overflow,[]);assert.ok(report.right<=1872.01);
  if(name==='numeric')assert.deepEqual(report.values,[['変更前不明','→','300'],['1200','→','1500'],['1～100%','→','100%']]);
  assert.equal(png.readUInt32BE(16),1920);assert.equal(png.readUInt32BE(20),1080);
 }
}finally{await browser.close();}
