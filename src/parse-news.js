import { chromium } from 'playwright';
import { classifyAdjustment } from './classify-adjustment.js';

const aliases = new Map([['空中格闘','空中格闘攻撃'],['空格','空中格闘攻撃'],['地上格闘','地上格闘攻撃'],['通常格闘','地上格闘攻撃']]);
const canonical = title => aliases.get(title) ?? title;
const styleScope = (character, title) => character.style ? 'specified' : /^(?:特殊アクション|空中格闘攻撃|地上格闘攻撃|格闘攻撃)/.test(title ?? '') ? 'all' : 'unknown';
export function parseLines(lines) {
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
      character.adjustments.push({ line: line.number, skill: skill?.title ?? null, styleScope: styleScope(character,skill?.title), raw: content, ...classifyAdjustment(content) });
      if (skill) skill.used = true;
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
      for (const el of root.children) {
        const copy = el.cloneNode(true);
        copy.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        const heading = /^H[1-6]$/.test(el.tagName);
        for (const text of copy.textContent.split('\n')) if (text.trim()) out.push({ number: out.length + 1, text, heading });
      }
      return out;
    });
    if (!lines.length) throw new Error('Empty article');
    return parseLines(lines);
  } finally { await browser.close(); }
}
