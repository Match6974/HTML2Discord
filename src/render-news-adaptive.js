import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {fetchNews} from './fetch-news.js';
import {parseNews} from './parse-news.js';
import {structureAdjustments} from './structure-adjustments.js';
import {buildPatchNoteHtml} from './patch-note-html.js';
const dir='output/news-adaptive';
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
 // Shared adjustments use one heading per group and one card per target.
 const sharedCharacters=(data.shared??[]).map(g=>({
   name:'共通バランス調整',style:g.title,
   skills:(g.kind==='general'?g.adjustments.map(a=>({title:g.title,raw:a.raw})):g.targets.map(t=>({title:t.name+(t.style?'（'+t.style+'）':t.styleScope==='all'?'（全バトルスタイル共通）':'（スタイル指定なし）'),raw:t.skills.join(' ／ ')}))).map(a=>({title:a.title,display:{segments:[{scope:'',scopeType:'unspecified',label:'',mode:'text',raw:a.raw,unit:'',before:null,after:null}]}}))
 }));
 for(let i=0;i<data.characters.length;i++){
   const c=data.characters[i];
   if(!c.style){
     article.characters[i].style=c.adjustments.every(a=>a.styleScope==='all')?'全バトルスタイル共通':'スタイル指定なし';
     if(!c.adjustments.every(a=>a.styleScope==='all')) article.characters[i].skills.forEach((s,j)=>{s.title+='（'+(c.adjustments[j].styleScope==='all'?'全バトルスタイル共通':'適用範囲不明')+'）';});
   }
 }
 article.characters.unshift(...sharedCharacters);
 assert.ok(article.characters.length);
 // Preserve source order across shared and individual groups.
 const order=[...(data.shared??[]).map(g=>g.line),...data.characters.map(c=>c.line)];
 article.characters=article.characters.map((c,i)=>({c,line:order[i]})).sort((a,b)=>a.line-b.line).map(x=>x.c);
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 const templates=article.characters.map((_,i)=>buildPatchNoteHtml({article,characterIndex:i}));
 const css='.rows{display:flex;flex-direction:column;gap:24px;flex:none}.columns{flex:none}.columns[data-cols="1"] .character-name{font-size:52px}.columns[data-cols="3"] .character-name{font-size:38px}.columns[data-cols="3"] .value-before,.columns[data-cols="3"] .value-after{font-size:40px}.columns{display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));gap:24px;align-items:start}.character-column{display:flex;flex-direction:column;gap:16px;min-width:0}.character-column .character-header{padding:16px 20px}.character-column .character-name{font-size:42px;overflow-wrap:anywhere}.character-column .battle-style{overflow-wrap:anywhere}.character-column .skill-card{padding:18px;min-width:0}.character-column .skill-title{font-size:32px;overflow-wrap:anywhere}.character-column .segment-header{margin-top:8px;flex-wrap:wrap;gap:12px}.character-column .raw-text{font-size:30px;white-space:pre-line}.character-column .value-row{flex-wrap:wrap;gap:16px}.character-column .value-before,.character-column .value-after{font-size:48px;max-width:100%;overflow-wrap:anywhere}.character-column .value-arrow{font-size:40px}';
 await page.setContent(templates[0].replace(/<script>[\s\S]*?<\/script>/,''));
 await page.addStyleTag({content:css});
 await page.evaluate(()=>document.fonts.ready);
 async function draw(rows,n=1,total=1){
  return page.evaluate(({rows,templates,n,total})=>{
   const root=document.querySelector('.page');
   root.querySelectorAll('.character-header,.skill-card,.reason-card,.rows').forEach(e=>e.remove());
   const stack=document.createElement('div');stack.className='rows';
   for(const items of rows){
   const grid=document.createElement('div');grid.className='columns';grid.style.setProperty('--cols',items.length);grid.dataset.cols=items.length;
   for(const item of items){
    const doc=new DOMParser().parseFromString(templates[item.i],'text/html');
    const col=document.createElement('section');col.className='character-column';
    col.append(document.importNode(doc.querySelector('.character-header'),true));
    if(item.start>0)col.querySelector('.battle-style').append('（続き）');
    const cards=[...doc.querySelectorAll('.skill-card')];
    for(let j=item.start;j<item.end;j++){const card=document.importNode(cards[j],true);card.dataset.cardId=item.i+':'+j;col.append(card);}
    grid.append(col);
   }
   stack.append(grid);
   }
   root.append(stack);
   const number=String(n).padStart(2,'0')+' / '+String(total).padStart(2,'0');
   document.querySelector('.page-number').textContent=number;document.querySelector('.footer-page').textContent=number;
   const footer=document.querySelector('footer').getBoundingClientRect();
   const cols=[...stack.querySelectorAll('.character-column')], rects=cols.map(e=>e.getBoundingClientRect());
   const overflow=[...stack.querySelectorAll('*')].filter(e=>e.clientWidth>0&&(e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1)).map(e=>e.className);
   return {footerGap:footer.top-Math.max(...rects.map(r=>r.bottom)),right:Math.max(...rects.map(r=>r.right)),overflow,ids:[...stack.querySelectorAll('.skill-card')].map(e=>e.dataset.cardId),segments:stack.querySelectorAll('.segment').length};
  },{rows,templates,n,total});
 }
 const fits=r=>r.footerGap>=24&&r.right<=1872.01&&!r.overflow.length;
 // A row contains consecutive character blocks. Prefer whole characters,
 // then use remaining space for a prefix of the next character if necessary.
 const plans=[];let rows=[],i=0,start=0;
 const count=i=>article.characters[i].skills.length;
 while(i<article.characters.length){
  assert.ok(count(i)>0);
  const candidates=[];
  for(let width=1;width<=3&&i+width<=article.characters.length;width++){
   const row=Array.from({length:width},(_,j)=>({i:i+j,start:j===0?start:0,end:count(i+j)}));
   if(fits(await draw([...rows,row])))candidates.push({row,complete:width,cards:row.reduce((n,x)=>n+x.end-x.start,0)});
   // Allow only the last block in a row to be split, preserving reading order.
   const last=row.at(-1);
   for(let end=last.end-1;end>last.start;end--){
    const partial=[...row.slice(0,-1),{...last,end}];
    if(fits(await draw([...rows,partial]))){candidates.push({row:partial,complete:width-1,cards:partial.reduce((n,x)=>n+x.end-x.start,0)});break;}
   }
  }
  candidates.sort((a,b)=>b.complete-a.complete||b.cards-a.cards||a.row.length-b.row.length);
  if(candidates.length){
   const row=candidates[0].row;rows.push(row);
   const last=row.at(-1);i=last.i;start=last.end;
   if(start===count(i)){i++;start=0;}
   continue;
  }
  if(rows.length){plans.push({rows});rows=[];continue;}
  // A single full-width card cannot fit at normal size. Use legacy fallback.
  plans.push({fallback:{i,start,end:start+1}});start++;
  if(start===count(i)){i++;start=0;}
 }
 if(rows.length)plans.push({rows});
 const report=[],ids=[];let segments=0;
 for(let k=0;k<plans.length;k++){
  const plan=plans[k];let info;
  if(plan.fallback){
   const item=plan.fallback,c=article.characters[item.i];
   const single={...article,characters:[{...c,style:c.style+(item.start?'（続き）':''),skills:c.skills.slice(item.start,item.end)}]};
   const fallback=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
   try{
    await fallback.setContent(buildPatchNoteHtml({article:single}));await fallback.waitForFunction(()=>window.renderReady===true);
    info=await fallback.evaluate(({n,total,id})=>{
     const number=String(n).padStart(2,'0')+' / '+String(total).padStart(2,'0');
     document.querySelector('.page-number').textContent=number;document.querySelector('.footer-page').textContent=number;
     const rects=[...document.querySelector('.page').children].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect());
     return {footerGap:document.querySelector('footer').getBoundingClientRect().top-Math.max(...rects.map(r=>r.bottom)),right:Math.max(...rects.map(r=>r.right)),overflow:[...document.querySelectorAll('.skill-card,.value-row,.raw-text')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.className),ids:[id],segments:document.querySelectorAll('.segment').length,scale:window.paginationResult.pages[0].scale,pages:window.paginationResult.totalPages,cards:document.querySelectorAll('.skill-card').length};
    },{n:k+1,total:plans.length,id:item.i+':'+item.start});
    assert.equal(info.pages,1);assert.equal(info.cards,1);assert.ok(info.scale>=.7);assert.ok(fits(info),JSON.stringify(info));
    const png=await fallback.screenshot({path:dir+'/page-'+String(k+1).padStart(2,'0')+'.png'});assert.equal(png.readUInt32BE(16),1920);assert.equal(png.readUInt32BE(20),1080);
   }finally{await fallback.close();}
  }else{
   info=await draw(plan.rows,k+1,plans.length);assert.ok(fits(info),JSON.stringify(info));
   const png=await page.screenshot({path:dir+'/page-'+String(k+1).padStart(2,'0')+'.png'});assert.equal(png.readUInt32BE(16),1920);assert.equal(png.readUInt32BE(20),1080);
  }
  ids.push(...info.ids);segments+=info.segments;report.push({page:k+1,...plan,columnCounts:plan.rows?.map(r=>r.length)??[1],...info});
  await writeFile(dir+'/layout-results.json',JSON.stringify(report,null,2));
 }
 assert.deepEqual(ids,article.characters.flatMap((c,i)=>c.skills.map((_,j)=>i+':'+j)));
 assert.equal(segments,article.characters.flatMap(c=>c.skills).reduce((n,a)=>n+a.display.segments.length,0));
 await writeFile(dir+'/result.json',JSON.stringify({url,status:'ok',total:plans.length,cards:ids.length,segments,mixedPages:report.filter(p=>new Set(p.columnCounts).size>1).length,columnCounts:report.map(p=>p.columnCounts)},null,2));
} catch(e){await writeFile(dir+'/error.txt',String(e.stack??e));throw e;} finally {await browser?.close();}
