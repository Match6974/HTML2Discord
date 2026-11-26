import { chromium } from 'playwright';
import { classifyAdjustment } from './classify-adjustment.js';

const aliases = new Map([['空中格闘','空中格闘攻撃'],['空格','空中格闘攻撃'],['地上格闘','地上格闘攻撃'],['通常格闘','地上格闘攻撃']]);
const canonical = title => aliases.get(title) ?? title;
const styleScope = (character, title) => character.style ? 'specified' : /^(?:特殊アクション|空中格闘攻撃|地上格闘攻撃|格闘攻撃)/.test(title ?? '') ? 'all' : 'unknown';
function parseIndividualLines(lines) {
  const result = { status: 'no-target', characters: [], unparsed: [], outside: [], lines };
  let target = false, character = null, skill = null, reason = false;
  const warn = (line, why) => result.unparsed.push({ ...line, why });
  for (const line of lines) {
    const raw = line.text.trim();
    if (!raw) continue;
    const t = raw.normalize('NFKC');
    if (/^■/.test(t) || line.heading) {
      target = /^■?\s*バトルスタイル調整$/.test(t);
      if (target) result.status = 'ok';
      character = null; skill = null; reason = false;
      result.outside.push(line); continue;
    }
    if (!target) { result.outside.push(line); continue; }
    if (/^今後とも.*よろしくお願いいたします。?$/.test(t)) { target = false; result.outside.push(line); continue; }
    const header = t.match(/^[【〖\[](.+)\(([^()]*)\)[】〗\]]$/) ?? t.match(/^[【〖\[]([^【】〖〗\[\]()]+)[】〗\]]$/);
    if (header) {
      character = { name: header[1], style: header[2] ?? null, rawHeader: raw, line: line.number, adjustments: [], reason: [] };
      result.characters.push(character); skill = null; reason = false; continue;
    }
    if (!character) { warn(line, 'missing character'); continue; }
    if (/^[<〈《]?調整意図[>〉》]?$/.test(t)) { reason = true; skill = null; continue; }
    if (/^[【〖\[]/.test(t)) { warn(line, 'unknown character header'); character = null; continue; }
    if (reason) {
      if (/^[・●•└]/.test(t)) warn(line, 'unexpected bullet in reason');
      character.reason.push(raw); continue;
    }
    const bullet = raw.match(/^[・●•]\s*(.+)$/);
    const child = raw.match(/^└\s*(.+)$/);
    const addition = bullet?.[1].match(/^(特殊アクション\s*[0-9０-９]+[「『].+[」』])を追加(?:しました)?。?$/);
    if (addition) {
      if (skill && !skill.used) warn(skill.line, 'skill without adjustment');
      skill = null;
      character.adjustments.push({line:line.number,skill:'特殊アクション',raw:bullet[1],action:addition[1],kind:'addition',styleScope:styleScope(character,'特殊アクション'),...classifyAdjustment(bullet[1])});
      continue;
    }
    if (bullet && (/^(?:[“”"「『]?個性[“”"」』]?技|特殊アクション|格闘攻撃)/.test(bullet[1]) && /[「『]/.test(bullet[1]) || /^(?:空中格闘攻撃|空中格闘|空格|地上格闘攻撃|地上格闘|通常格闘|格闘攻撃|特殊アクション)$/.test(bullet[1].trim()))) {
      if (skill && !skill.used) warn(skill.line, 'skill without adjustment');
      skill = { title: canonical(bullet[1].trim()), line, used: false }; continue;
    }
    if (child || bullet) {
      if (child && !skill) { warn(line, 'orphan adjustment'); continue; }
      if (bullet && skill && !skill.used) warn(skill.line, 'skill without adjustment');
      if (bullet) skill = null;
      const content = (child || bullet)[1];
      character.adjustments.push({ line: line.number, skill: skill?.title ?? null, styleScope: styleScope(character,skill?.title), raw: content, ...classifyAdjustment(content,{skill:skill?.title,name:character.name,style:character.style}) });
      if (skill) skill.used = true;
      continue;
    }
    const previous=character.adjustments.at(-1);
    if (/^\(.+\)$/.test(t) && /^[\s　]/.test(line.text) && previous && (previous.noteLines?.at(-1) ?? previous.line)===line.number-1) {
      previous.noteLines=[...(previous.noteLines??[]),line.number];
      previous.notes=[...(previous.notes??[]),raw];
      previous.raw+='\n'+raw;
      continue;
    }
    warn(line, 'unknown adjustment format');
  }
  if (skill && !skill.used) warn(skill.line, 'skill without adjustment');
  for (const c of result.characters) if (!c.adjustments.length) result.unparsed.push({ text: c.rawHeader, number: c.line, why: 'empty character' });
  if (result.status === 'ok' && !result.characters.length) result.unparsed.push({ why: 'no characters in target section' });
  if (result.unparsed.length) result.status = 'incomplete';
  return result;
}

// Extract shared blocks before individual parsing. Preserve every original line.
export function parseLines(lines) {
  const individual=[], shared=[], warnings=[];
  let active=false, group=null, target=null, reason=false;
  const finish=()=>{
    if(group){
      if(group.kind==='targets' && (!group.targets.length || group.targets.some(t=>!t.skills.length))) warnings.push({number:group.line,why:'shared adjustment without targets'});
      if(group.kind==='general' && !group.adjustments.length) warnings.push({number:group.line,why:'empty shared adjustment'});
      shared.push(group);
    }
    group=null;target=null;reason=false;
  };
  for(const [index,line] of lines.entries()){
    const t=line.text.trim().normalize('NFKC');
    if(line.heading || /^■/.test(t)){
      finish();active=/^■?\s*バトルスタイル調整$/.test(t);individual.push(line);continue;
    }
    if(!active){individual.push(line);continue;}
    const startGeneral=/^【格闘攻撃】$/.test(t);
    // Structural fallback: a separated prose heading followed by at least two
    // character headers with skill-only child rows.
    const isHeader=x=>/^【[^】]+】$/.test(x);
    const isSkill=x=>/^└\s*[“”"「『]?個性[“”"」』]?技.*[「『]/.test(x);
    let cursor=index+1, targetCount=0;
    if(!line.heading && !/^[■・●•└【]/.test(t) && (line.blankBefore>=2 || line.blockGap>=2 || index===1)){
      while(cursor<lines.length && isHeader(lines[cursor].text.trim().normalize('NFKC'))){
        cursor++;
        let count=0;
        while(cursor<lines.length && isSkill(lines[cursor].text.trim().normalize('NFKC'))){cursor++;count++;}
        if(!count)break;
        targetCount++;
      }
    }
    const structuralTargets=targetCount>=2 && /(?:変更|調整|追加|修正)/.test(t);
    const inlineTarget=x=>x.match(/^└\s*([^:：]+?)\(([^()]*)\)\s*[:：]\s*(.*)$/);
    const inlineSkill=x=>/^[“”"「『]?個性[“”"」』]?技.*[「『]/.test(x);
    const inlineStart=/^(?:・\s*)?(?:下記|以下)の技について.*(?:変更|調整)(?:しました)?。?$/.test(t) && Boolean(inlineTarget(lines[index+1]?.text.trim().normalize('NFKC')??''));
    const startTargets=inlineStart || structuralTargets || /^(?:・\s*)?(?:下記|以下)の.*個性.*技.*(?:調整|変更)(?:しました)?。?$/.test(t);
    const startActions=/^一部の特殊アクションにて.*変更$/.test(t);
    if(startGeneral||startTargets||startActions){
      finish();
      group={kind:startGeneral?'general':'targets',title:startGeneral?'格闘攻撃':line.text.trim().replace(/^・/,''),
        line:line.number,targets:[],adjustments:[],reason:[],sourceLines:[line]};
      if(startActions)group.actionTargets=true;
      if(inlineStart)group.inlineTargets=true;
      continue;
    }
    if(!group){individual.push(line);continue;}
    if(/^今後とも.*よろしくお願いいたします。?$/.test(t)){finish();active=false;individual.push(line);continue;}
    const header=t.match(/^【(.+?)\(([^()]*)\)】$/) ?? t.match(/^【([^】]+)】$/);
    const next=lines[index+1]?.text.trim()??'';
    if(header && (reason||group.kind==='general'||group.actionTargets||/^[・●•]/.test(next))){finish();individual.push(line);continue;}
    group.sourceLines.push(line);
    if(/^[<〈《]?調整意図[>〉》]?$/.test(t)){reason=true;continue;}
    if(reason){
      if(/^[・└]/.test(t))warnings.push({...line,why:'unexpected shared reason bullet'});
      group.reason.push(line.text.trim());continue;
    }
    if(group.kind==='general' && /^・/.test(t)){group.adjustments.push({line:line.number,raw:line.text.trim().slice(1)});continue;}
    if(header && group.kind==='targets'){target={name:header[1],style:header[2]??null,skills:[]};group.targets.push(target);continue;}
    if(group.actionTargets){
      const m=line.text.trim().match(/^・([^「]+)「(.+)」$/);
      if(m){group.targets.push({name:m[1],style:null,styleScope:'all',skills:[m[2]]});continue;}
    }
    if(group.inlineTargets){
      const m=inlineTarget(t);
      if(m){
        target={name:m[1],style:m[2],skills:[]};group.targets.push(target);
        const original=line.text.trim().replace(/^└\s*/,'').replace(/^.*?[：:]\s*/,'');
        if(m[3]){if(inlineSkill(m[3]))target.skills.push(original);else warnings.push({...line,why:'invalid inline skill'});}
        continue;
      }
      if(target && !target.skills.length && /^[\s　]/.test(line.text) && inlineSkill(t)){target.skills.push(line.text.trim());continue;}
      warnings.push({...line,why:'unknown inline shared target'});continue;
    }
    if(target && /^└/.test(t)){target.skills.push(line.text.trim().replace(/^└\s*/,''));continue;}
    warnings.push({...line,why:'unknown shared adjustment format'});
  }
  finish();
  const result=parseIndividualLines(individual);
  if(shared.length && !result.characters.length)result.unparsed=result.unparsed.filter(x=>x.why!=='no characters in target section');
  result.lines=lines;result.shared=shared;result.unparsed.push(...warnings);
  if(result.unparsed.length)result.status='incomplete';
  else if(shared.length)result.status='ok';
  return result;
}

export async function parseNews(html) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ javaScriptEnabled: false });
    await page.route('**/*', route => route.abort());
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const lines = await page.evaluate(() => {
      const roots = document.querySelectorAll('.articleInner');
      if (roots.length !== 1) throw new Error('Expected one articleInner');
      const root = roots[0];
      const out = [];
      let blanks=0, blockGap=0;
      for (const el of root.children) {
        const copy = el.cloneNode(true);
        copy.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        const heading = /^H[1-6]$/.test(el.tagName);
        if(!copy.textContent.trim()){blockGap++;blanks+=copy.textContent.split('\n').length;continue;}
        for (const text of copy.textContent.split('\n')) {
          if(!text.trim()){blanks++;continue;}
          out.push({number:out.length+1,text,heading,blankBefore:blanks,blockGap});
          blanks=0;blockGap=0;
        }
      }
      return out;
    });
    if (!lines.length) throw new Error('Empty article');
    return parseLines(lines);
  } finally { await browser.close(); }
}
