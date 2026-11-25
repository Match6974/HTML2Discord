import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {fetchNews} from './fetch-news.js';
import {parseNews} from './parse-news.js';
import {structureAdjustments} from './structure-adjustments.js';
import {buildPatchNoteHtml} from './patch-note-html.js';
const dir='output/news-render';
await mkdir(dir,{recursive:true});
let browser;
try {
 const {html,url}=await fetchNews('https://mhaur.bn-ent.net/news/?p=1573');
 const data=structureAdjustments(await parseNews(html));
 await writeFile(dir+'/data.json',JSON.stringify({url,...data},null,2));
 assert.equal(data.status,'ok');
 const colors={green:'#16A34A',red:'#DC2626',purple:'#9333EA',blue:'#2563EB'};
 const article={date:'2026.11.11',category:'バトルスタイル調整',characters:data.characters.map(c=>({...c,skills:c.adjustments.map(a=>({title:a.skill??a.metric??'調整内容',display:{segments:a.display.segments.map(s=>({...s,scope:s.scope.label??'',scopeType:s.scope.type==='remainder'?'unresolved':s.scope.type,unit:s.unit??'',raw:a.raw,displayColor:colors[s.color]??null,afterColor:colors[s.color]??null}))}}))}))};
 browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 const plans=[];
 for(let i=0;i<article.characters.length;i++){
   await page.goto('about:blank');
   await page.setContent(buildPatchNoteHtml({article,characterIndex:i}));
   await page.waitForFunction(()=>window.renderReady===true);
   const plan=await page.evaluate(()=>window.paginationResult);
   assert.ok(plan.totalPages>0&&plan.totalPages<=100);
   assert.equal(plan.pages.reduce((n,p)=>n+p.cardCount,0),article.characters[i].skills.length);
   assert.ok(plan.pages.every(p=>!p.belowMinimumScale));
   plans.push(plan);
 }
 const total=plans.reduce((n,p)=>n+p.totalPages,0);
 let index=0, cards=0, segments=0;
 const report=[];
 for(let i=0;i<plans.length;i++) for(let j=1;j<=plans[i].totalPages;j++){
   await page.goto('about:blank');
   await page.setContent(buildPatchNoteHtml({article,characterIndex:i,requestedPageFromWorker:j}));
   await page.waitForFunction(()=>window.renderReady===true);
   const n=++index;
   const info=await page.evaluate(({n,total})=>{
     const number=String(n).padStart(2,'0')+' / '+String(total).padStart(2,'0');
     document.querySelector('.page-number').textContent=number;
     document.querySelector('.footer-page').textContent=number;
     const footer=document.querySelector('footer').getBoundingClientRect();
     const els=[...document.querySelector('.page').children].filter(e=>e.getClientRects().length);
     const rects=els.map(e=>e.getBoundingClientRect());
     return {selected:window.selectedPage,cards:document.querySelectorAll('.skill-card').length,segments:document.querySelectorAll('.segment').length,bottom:Math.max(...rects.map(r=>r.bottom)),right:Math.max(...rects.map(r=>r.right)),footerTop:footer.top,overflow:[...document.querySelectorAll('.skill-card,.value-row,.raw-text')].some(e=>e.scrollWidth>e.clientWidth+1)};
   },{n,total});
   report.push({page:n,character:article.characters[i].name,...info});
   await writeFile(dir+'/layout-results.json',JSON.stringify(report,null,2));
   assert.equal(info.selected,j);assert.ok(info.bottom<=info.footerTop-24);assert.ok(info.right<=1872);assert.ok(!info.overflow);
   cards+=info.cards;segments+=info.segments;
   await page.screenshot({path:dir+'/page-'+String(n).padStart(2,'0')+'.png'});
 }
 assert.equal(cards,24);assert.equal(segments,26);
 console.log({total,cards,segments});
} catch(e){await writeFile(dir+'/error.txt',String(e.stack??e));throw e;} finally {await browser?.close();}
