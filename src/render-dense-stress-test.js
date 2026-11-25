import {createAdaptiveRenderer,fits} from './dense-adaptive-renderer.js';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {fetchNews} from './fetch-news.js';
import {parseNews} from './parse-news.js';
import {structureAdjustments} from './structure-adjustments.js';
import {buildPatchNoteHtml} from './patch-note-html.js';
const dir='output/dense-stress';
await mkdir(dir,{recursive:true});
const url='synthetic-stress';
const skill=(title,raw,color=null,extra={})=>({title,groupable:true,display:{segments:[{scope:'',scopeType:'unspecified',label:color?'強化':'判定保留',mode:'text',raw,unit:'',before:null,after:null,displayColor:color,...extra}]}});
const article={date:'2026.11.25',category:'バトルスタイル調整',characters:[
{name:'長文テスト',style:'オリジナル',skills:[skill('個性技α','調整内容の詳細を確認するための長文です。'.repeat(18),'#16A34A')]},
{name:'多数項目テスト',style:'オリジナル',skills:Array.from({length:32},(_,i)=>skill('個性技'+(i%3),'調整項目 '+(i+1)+' ダメージを増加','#16A34A'))},
{name:'長いキャラクター名'.repeat(4),style:'長いバトルスタイル名'.repeat(3),skills:[skill('長い個性技名'.repeat(8),'ダメージを増加\n（補足文章その1）\n（補足文章その2）','#16A34A')]},
{name:'数値テスト',style:'オリジナル',skills:[skill('個性技β','弾数の使用条件を変更','#DC2626',{label:'弱体化',mode:'before-after',before:'1～100',after:100,unit:'%',afterColor:'#DC2626'}),skill('個性技γ','リロード時間を短縮','#9333EA')]},
{name:'共通バランス調整',style:'対象一覧テスト',sharedKind:'targets',skills:Array.from({length:40},(_,i)=>skill('対象キャラクター '+(i+1),'個性技α「対象技」'))}
]};
let browser;
try{
 browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 const draw=await createAdaptiveRenderer(page,article);
 // A row contains consecutive character blocks. Prefer whole characters,
 // then use remaining space for a prefix of the next character if necessary.
 async function planPages(){
 const plans=[];let rows=[],i=0,start=0;
 const count=i=>article.characters[i].skills.length;
 while(i<article.characters.length){
  assert.ok(count(i)>0);
  // Fill each column top-to-bottom, preserving contiguous source order.
  if(!rows.length && !article.characters[i].sharedKind){
   let best=null;
   for(let width=1;width<=6;width++){
    const columns=[];let next=i,offset=start;
    for(let col=0;col<width&&next<article.characters.length&&!article.characters[next].sharedKind;col++){
     const items=[];
     while(next<article.characters.length&&!article.characters[next].sharedKind){
      const item={i:next,start:offset,end:count(next)};
      if(fits(await draw([...columns,[...items,item]],1,1,width))){
       items.push(item);next++;offset=0;continue;
      }
      if(!items.length){
       for(let end=item.end-1;end>offset;end--){
        const partial={...item,end};
        if(fits(await draw([...columns,[partial]],1,1,width))){items.push(partial);offset=end;break;}
       }
      }
      break;
     }
     if(!items.length)break;
     columns.push(items);
    }
    if(!columns.length)continue;
    const splits=columns.flat().filter(x=>x.end<count(x.i)).length;
    const candidate={rows:columns,columnCount:width,next,offset,splits};
    if(!best||next>best.next||(next===best.next&&(offset>best.offset||(offset===best.offset&&splits<best.splits))))best=candidate;
   }
   if(best){plans.push({rows:best.rows,columnCount:best.columnCount});i=best.next;start=best.offset;continue;}
  }
  if(rows.length&&!article.characters[i].sharedKind){plans.push({rows});rows=[];continue;}
  const candidates=[];
  if(article.characters[i].sharedKind){
   for(let end=count(i);end>start;end--){
    for(let cols=1;cols<=Math.min(article.characters[i].sharedKind==='general'?1:6,end-start);cols++){
     const row=[{i,start,end,targetCols:cols}];
     const info=await draw([...rows,row]);
     if(fits(info))candidates.push({row,complete:end===count(i)?1:0,cards:end-start,gap:info.footerGap});
    }
    if(candidates.length)break;
   }
  }else for(let width=1;width<=6&&i+width<=article.characters.length;width++){
   if(article.characters[i+width-1].sharedKind)break;
   const row=Array.from({length:width},(_,j)=>({i:i+j,start:j===0?start:0,end:count(i+j)}));
   if(fits(await draw([...rows,row])))candidates.push({row,complete:width,cards:row.reduce((n,x)=>n+x.end-x.start,0)});
   // Allow only the last block in a row to be split, preserving reading order.
   const last=row.at(-1);
   for(let end=last.end-1;end>last.start;end--){
    const partial=[...row.slice(0,-1),{...last,end}];
    if(fits(await draw([...rows,partial]))){candidates.push({row:partial,complete:width-1,cards:partial.reduce((n,x)=>n+x.end-x.start,0)});break;}
   }
  }
  candidates.sort((a,b)=>b.complete-a.complete||b.cards-a.cards||a.row.length-b.row.length||(b.gap??0)-(a.gap??0));
  if(candidates.length){
   const row=candidates[0].row;rows.push(row);
   const last=row.at(-1);i=last.i;start=last.end;
   if(start===count(i)){i++;start=0;}
   continue;
  }
  if(rows.length){plans.push({rows});rows=[];continue;}
  // A single full-width card cannot fit at normal size. Use legacy fallback.
  const rejected=await draw([[{i,start,end:start+1}]]);
  await writeFile(dir+'/fallback-'+i+'-'+start+'.json',JSON.stringify(rejected,null,2));
  plans.push({fallback:{i,start,end:start+1}});start++;
  if(start===count(i)){i++;start=0;}
 }
 if(rows.length)plans.push({rows});
 return plans;
 }
 const plans=await planPages();
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
   info=await draw(plan.rows,k+1,plans.length,plan.columnCount??0);assert.ok(fits(info),JSON.stringify(info));
   const png=await page.screenshot({path:dir+'/page-'+String(k+1).padStart(2,'0')+'.png'});assert.equal(png.readUInt32BE(16),1920);assert.equal(png.readUInt32BE(20),1080);
  }
  ids.push(...info.ids);segments+=info.segments;report.push({page:k+1,...plan,columnCounts:plan.columnCount?[plan.columnCount]:plan.rows?.map(r=>r[0].targetCols??r.length)??[1],...info});
  await writeFile(dir+'/layout-results.json',JSON.stringify(report,null,2));
 }
 assert.deepEqual(ids,article.characters.flatMap((c,i)=>c.skills.map((_,j)=>i+':'+j)));
 assert.equal(segments,article.characters.flatMap(c=>c.skills).reduce((n,a)=>n+a.display.segments.length,0));
 assert.ok(!plans.every(p=>p.fallback),'All pages used legacy fallback; inspect fallback diagnostics');
 await writeFile(dir+'/result.json',JSON.stringify({url,status:'ok',total:plans.length,cards:ids.length,segments,fallbackPages:report.filter(p=>p.fallback).length,mixedPages:report.filter(p=>new Set(p.columnCounts).size>1).length,columnCounts:report.map(p=>p.columnCounts)},null,2));
 }catch(e){await writeFile(dir+'/error.txt',String(e.stack??e));throw e;}finally{await browser?.close();}
