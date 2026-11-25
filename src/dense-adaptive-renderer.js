import {buildPatchNoteHtml} from './patch-note-html.js';
export async function createAdaptiveRenderer(page,article){
 const templates=article.characters.map((_,i)=>buildPatchNoteHtml({article,characterIndex:i}));
 const css='.character-column:not(.shared-block) .skill-card{padding:8px 12px}.character-column:not(.shared-block) .skill-card.group-continuation{margin-top:-16px;border-top:0;border-radius:0 0 6px 6px}.character-column:not(.shared-block) .skill-title{font-size:26px;color:#075985}.character-column:not(.shared-block) .segment{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:start}.character-column:not(.shared-block) .segment-header{display:contents}.character-column:not(.shared-block) .segment-scope{grid-column:1/-1;font-size:20px}.character-column:not(.shared-block) .segment-scope:empty{display:none}.character-column:not(.shared-block) .segment-label{grid-column:2;grid-row:2;font-size:22px;white-space:nowrap}.character-column:not(.shared-block) .raw-text{grid-column:1;grid-row:2;margin:0;font-size:24px}.character-column:not(.shared-block) .value-row,.character-column:not(.shared-block) .note{grid-column:1/-1;margin-top:4px}.character-column:not(.shared-block) .segment+.segment{margin-top:8px;padding-top:8px}.shared-block{display:flex;flex-direction:column;gap:16px;min-width:0;grid-column:1/-1}.shared-targets{display:grid;grid-template-columns:repeat(var(--targets),minmax(0,1fr));gap:24px;align-items:start}.shared-targets .skill-card{min-width:0;padding:18px}.shared-targets .skill-title{font-size:32px;overflow-wrap:anywhere}.shared-targets .raw-text{font-size:30px;white-space:pre-line}.shared-block .battle-style{white-space:normal;overflow-wrap:anywhere}.rows{display:flex;flex-direction:column;gap:24px;flex:none}.columns{flex:none}.columns[data-cols="1"] .character-name{font-size:52px}.columns[data-cols="3"] .character-name{font-size:38px}.columns[data-cols="3"] .value-before,.columns[data-cols="3"] .value-after{font-size:40px}.columns{display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));gap:24px;align-items:start}.character-column{display:flex;flex-direction:column;gap:16px;min-width:0}.character-column .character-header{padding:16px 20px}.character-column .character-name{font-size:42px;overflow-wrap:anywhere}.character-column .battle-style{overflow-wrap:anywhere}.character-column .skill-card{padding:18px;min-width:0}.character-column .skill-title{font-size:32px;overflow-wrap:anywhere}.character-column .segment-header{margin-top:8px;flex-wrap:wrap;gap:12px}.character-column .raw-text{font-size:30px;white-space:pre-line}.character-column .value-row{flex-wrap:wrap;gap:16px}.character-column .value-before,.character-column .value-after{font-size:48px;max-width:100%;overflow-wrap:anywhere}.character-column .value-arrow{font-size:40px}.character-column:not(.shared-block){background:#17223b;color:#fff;border:1px solid #526480;border-radius:10px;padding:12px;gap:8px;box-sizing:border-box}.character-column:not(.shared-block) .character-header{background:transparent;border:0;border-bottom:1px solid #526480;border-radius:0;padding:0 0 8px;box-shadow:none;color:#fff}.character-column:not(.shared-block) .skill-card{background:transparent;color:#fff;border:0;border-radius:0;box-shadow:none;padding:0;min-height:0}.character-column:not(.shared-block) .skill-card.group-continuation{margin-top:0;border:0}.character-column:not(.shared-block) .skill-title{color:#7dd3fc}.character-column:not(.shared-block) .raw-text,.character-column:not(.shared-block) .segment-scope,.character-column:not(.shared-block) .note,.character-column:not(.shared-block) .value-before,.character-column:not(.shared-block) .value-arrow{color:#e2e8f0}.character-column:not(.shared-block) .segment-label,.character-column:not(.shared-block) .value-after{background:#fff;border-radius:4px;padding:0 4px}.character-column:not(.shared-block) .segment-header{margin:0}.character-column:not(.shared-block){background:#fff;color:#111827;overflow:visible}.character-column:not(.shared-block) .character-header{background:#17223b;color:#fff;margin:-12px -12px 0;padding:8px 12px;border-radius:9px 9px 0 0}.character-column:not(.shared-block) .character-header .character-name,.character-column:not(.shared-block) .character-header .battle-style{color:#fff}.character-column:not(.shared-block) .skill-card{color:#111827}.character-column:not(.shared-block) .skill-title{color:#075985}.character-column:not(.shared-block) .raw-text,.character-column:not(.shared-block) .segment-scope,.character-column:not(.shared-block) .note,.character-column:not(.shared-block) .value-before,.character-column:not(.shared-block) .value-arrow{color:#111827}.character-column:not(.shared-block) .segment-label,.character-column:not(.shared-block) .value-after{background:transparent;padding:0}.rows,.columns{gap:12px}.character-column:not(.shared-block){padding:8px;gap:6px}.character-column:not(.shared-block) .character-header{margin:0;padding:6px 8px}.character-column:not(.shared-block) .character-name{font-size:28px;line-height:1.35}.character-column:not(.shared-block) .battle-style{font-size:22px;line-height:1.35}.character-column:not(.shared-block) .skill-title{font-size:24px;line-height:1.35}.character-column:not(.shared-block) .raw-text{font-size:22px;line-height:1.35}.character-column:not(.shared-block) .segment-label{font-size:20px;line-height:1.35}.character-column:not(.shared-block) .segment{gap:2px 8px}.character-column:not(.shared-block) .segment+.segment{margin-top:4px;padding-top:4px}.character-column:not(.shared-block){padding:0;gap:6px}.character-column:not(.shared-block) .character-header{margin:0;padding:6px 8px;border-radius:9px 9px 0 0}.character-column:not(.shared-block) .skill-card{margin-left:8px;margin-right:8px}.character-column:not(.shared-block) .skill-card:last-child{margin-bottom:8px}.character-column:not(.shared-block) .value-row{gap:8px;justify-content:flex-start;align-items:baseline;margin-top:2px;min-height:0}.character-column:not(.shared-block) .value-before,.character-column:not(.shared-block) .value-after{font-size:26px;line-height:1.4;max-width:100%}.character-column:not(.shared-block) .value-arrow{font-size:22px;line-height:1.4}.character-column:not(.shared-block) .note{font-size:18px;line-height:1.4;margin-top:2px}h1{font-size:48px!important}.character-column:not(.shared-block) .raw-text{display:flex;align-items:flex-start;gap:6px}.adjustment-icon{flex:none;width:22px;height:30px;display:flex;align-items:center;justify-content:center}.adjustment-icon svg{display:block;width:20px;height:20px;flex:none}.adjustment-copy{min-width:0;flex:1;white-space:pre-line;overflow-wrap:anywhere}.adjustment-supplement,.character-column:not(.shared-block) .note{font-size:18px;color:#6b7280;line-height:1.4}.adjustment-supplement{display:block}.shared-block{background:#fff;border:1px solid #526480;border-radius:10px;padding:0;gap:8px}.shared-block .character-header{background:#17223b;color:#fff;border:0;border-radius:9px 9px 0 0;padding:6px 12px;margin:0}.shared-block .character-name{font-size:28px!important;color:#fff;line-height:1.35}.shared-block .battle-style{font-size:22px;color:#fff;line-height:1.35}.shared-targets{gap:8px;padding:0 8px 8px;grid-auto-flow:column;grid-template-rows:repeat(var(--target-rows),auto)}.shared-targets .skill-card{padding:8px;border-radius:6px;min-height:0}.shared-targets .skill-title{font-size:24px;line-height:1.35;color:#075985}.shared-targets .raw-text{font-size:22px;line-height:1.35;margin-top:4px}.shared-targets .segment-header{margin:0;gap:4px}.shared-targets .segment-header:has(.segment-label:empty):has(.segment-scope:empty){display:none}.shared-targets .segment-label{font-size:20px}.shared-targets .note,.shared-targets .adjustment-supplement{font-size:18px;color:#6b7280}.shared-targets .raw-text:has(.adjustment-icon){display:flex;align-items:flex-start;gap:6px}';
 await page.setContent(templates[0].replace(/<script>[\s\S]*?<\/script>/,''));
 await page.addStyleTag({content:css});
 await page.evaluate(()=>document.fonts.ready);
 async function draw(rows,n=1,total=1,columnCount=0){
  return page.evaluate(({rows,templates,n,total,shared,sharedKeys,columnCount})=>{
   const root=document.querySelector('.page');
   root.querySelectorAll('.character-header,.skill-card,.reason-card,.rows').forEach(e=>e.remove());
   const stack=document.createElement('div');stack.className='rows';
   if(columnCount){stack.style.display='grid';stack.style.gridTemplateColumns='repeat('+columnCount+',minmax(0,1fr))';stack.style.alignItems='start';}
   for(const items of rows){
   const grid=document.createElement('div');grid.className='columns';grid.style.setProperty('--cols',items.length);grid.dataset.cols=items.length;
   if(columnCount){grid.style.setProperty('--cols',1);grid.dataset.cols=columnCount;grid.style.alignContent='start';}
   for(const item of items){
    const doc=new DOMParser().parseFromString(templates[item.i],'text/html');
    const col=document.createElement('section');col.className='character-column';
    col.append(document.importNode(doc.querySelector('.character-header'),true));
    if(item.start>0)col.querySelector('.battle-style').append('（続き）');
    const cards=[...doc.querySelectorAll('.skill-card')];
    if(shared[item.i]){
    col.classList.add('shared-block');
    const targets=document.createElement('div');targets.className='shared-targets';targets.style.setProperty('--targets',item.targetCols??1);targets.style.setProperty('--target-rows',Math.ceil((item.end-item.start)/(item.targetCols??1)));
    for(let j=item.start;j<item.end;j++){const card=document.importNode(cards[j],true);card.dataset.cardId=item.i+':'+j;targets.append(card);}
    col.append(targets);
   }else for(let j=item.start;j<item.end;j++){const card=document.importNode(cards[j],true);card.dataset.cardId=item.i+':'+j;col.append(card);}
    if(!shared[item.i]){
     let previous=null;
     for(const card of col.querySelectorAll('.skill-card')){
      const title=card.querySelector('.skill-title');
      const key=title.textContent.trim();
      if(previous===key && sharedKeys[item.i][Number(card.dataset.cardId.split(':')[1])]){title.remove();card.classList.add('group-continuation');}
      previous=key;
     }
    }
    if(!shared[item.i]||shared[item.i]==='general')for(const segment of col.querySelectorAll('.segment')){
     const raw=segment.querySelector('.raw-text');if(!raw)continue;
     const label=segment.querySelector('.segment-label');
     const color=(label?.style.color??'').replace(/\s/g,'').toLowerCase();
     const palette={'rgb(22,163,74)':['↑','#16A34A'],'rgb(220,38,38)':['↓','#DC2626'],'rgb(37,99,235)':['↓','#2563EB'],'rgb(147,51,234)':['↑','#9333EA']};
     const [symbol,tint]=palette[color]??['−','#6B7280'];
     const original=raw.textContent;
     const icon=document.createElement('span');icon.className='adjustment-icon';icon.style.color=tint;
     const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
     const path=document.createElementNS('http://www.w3.org/2000/svg','path');
     path.setAttribute('d',symbol==='↑'?'M12 1L23 12H17V23H7V12H1Z':symbol==='↓'?'M12 23L1 12H7V1H17V12H23Z':'M3 9H21V15H3Z');
     path.setAttribute('fill','currentColor');path.setAttribute('stroke','none');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);icon.append(svg);
     const copy=document.createElement('span');copy.className='adjustment-copy';
     const lines=original.split('\n');
     for(let j=0;j<lines.length;j++){
      if(j>0&&/^\s*[（(]/.test(lines[j])){const note=document.createElement('span');note.className='adjustment-supplement';note.textContent=lines[j];copy.append(note);}
      else copy.append(document.createTextNode((j?'\n':'')+lines[j]));
     }
     raw.replaceChildren(icon,copy);
    }
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
  },{rows,templates,n,total,columnCount,shared:article.characters.map(c=>c.sharedKind??null),sharedKeys:article.characters.map(c=>c.skills.map(s=>s.groupable??false))});
 }

 return draw;
}
export const fits=r=>r.footerGap>=24&&r.right<=1872.01&&!r.overflow.length;
