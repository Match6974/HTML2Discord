import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {fetchNews} from './fetch-news.js';
import {parseNews} from './parse-news.js';
import {structureAdjustments} from './structure-adjustments.js';
import {buildPatchNoteHtml} from './patch-note-html.js';
const dir='output/news-general';
await mkdir(dir,{recursive:true});
let browser;
try {
 const {html,url}=await fetchNews(process.env.NEWS_URL);
 await writeFile(dir+'/source.html',html);
 const parsed=await parseNews(html);
 await writeFile(dir+'/parsed.json',JSON.stringify(parsed,null,2));
 if(parsed.status==='no-target'){
   await writeFile(dir+'/result.json',JSON.stringify({url,status:'no-target',pages:0},null,2));
   process.exit(0);
 }
 assert.equal(parsed.status,'ok','Incomplete parsing: see parsed.json');
 const data=structureAdjustments(parsed);
 await writeFile(dir+'/data.json',JSON.stringify({url,...data},null,2));
 assert.equal(data.status,'ok');
 const colors={green:'#16A34A',red:'#DC2626',purple:'#9333EA',blue:'#2563EB'};
 browser=await chromium.launch();
 const metadata=await browser.newPage({javaScriptEnabled:false});
 await metadata.route('**/*',route=>route.abort());
 await metadata.setContent(html,{waitUntil:'domcontentloaded'});
 const date=await metadata.evaluate(()=>{
   const root=document.querySelector('.articleInner');
   const candidates=[...document.querySelectorAll('time, .date, .articleDate, [class*="date" i]')].filter(e=>!root?.contains(e)).map(e=>e.getAttribute('datetime')||e.textContent.trim());
   const dates=[...new Set(candidates.map(t=>t.match(/^\s*(\d{4})[.\/年-](\d{1,2})[.\/月-](\d{1,2})(?:日|T.*)?\s*$/)).filter(Boolean).map(m=>m[1]+'.'+m[2].padStart(2,'0')+'.'+m[3].padStart(2,'0')))];
   return {dates,candidates};
 });
 await metadata.close();
 await writeFile(dir+'/date-candidates.json',JSON.stringify(date,null,2));
 assert.equal(date.dates.length,1,'Publication date missing or ambiguous');
 const article={date:date.dates[0],category:'バトルスタイル調整',characters:data.characters.map(c=>({...c,skills:c.adjustments.map(a=>({title:a.skill??a.metric??'調整内容',display:{segments:a.display.segments.map(s=>({...s,scope:s.scope.label??'',scopeType:s.scope.type==='remainder'?'unresolved':s.scope.type,unit:s.unit??'',raw:a.raw,displayColor:colors[s.color]??null,afterColor:colors[s.color]??null}))}}))}))};
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
   report.push({page:n,character:article.characters[i].name,scale:plans[i].pages[j-1].scale,...info});
   await writeFile(dir+'/layout-results.json',JSON.stringify(report,null,2));
   assert.equal(info.selected,j);assert.ok(info.bottom<=info.footerTop-24);assert.ok(info.right<=1872);assert.ok(!info.overflow);
   cards+=info.cards;segments+=info.segments;
   const png=await page.screenshot({path:dir+'/page-'+String(n).padStart(2,'0')+'.png'});
   assert.equal(png.readUInt32BE(16),1920);assert.equal(png.readUInt32BE(20),1080);
 }
 assert.equal(cards,data.characters.reduce((n,c)=>n+c.adjustments.length,0));
 assert.equal(segments,data.characters.flatMap(c=>c.adjustments).reduce((n,a)=>n+a.display.segments.length,0));
 await writeFile(dir+'/result.json',JSON.stringify({url,status:'ok',date:article.date,total,cards,segments},null,2));
 console.log({total,cards,segments});
} catch(e){await writeFile(dir+'/error.txt',String(e.stack??e));throw e;} finally {await browser?.close();}
