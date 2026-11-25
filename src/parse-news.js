import { chromium } from 'playwright';
import { classifyAdjustment } from './classify-adjustment.js';

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
    const header = t.match(/^[【〖\[](.+)\(([^()]*)\)[】〗\]]$/);
    if (header) {
      character = { name: header[1], style: header[2], rawHeader: raw, line: line.number, adjustments: [], reason: [] };
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
    if (bullet && /^(?:[“”"「『]?個性[“”"」』]?技|特殊アクション|格闘攻撃)/.test(bullet[1]) && /[「『]/.test(bullet[1])) {
      if (skill && !skill.used) warn(skill.line, 'skill without adjustment');
      skill = { title: bullet[1], line, used: false }; continue;
    }
    if (child || bullet) {
      if (child && !skill) { warn(line, 'orphan adjustment'); continue; }
      if (bullet && skill && !skill.used) warn(skill.line, 'skill without adjustment');
      if (bullet) skill = null;
      const content = (child || bullet)[1];
      character.adjustments.push({ line: line.number, skill: skill?.title ?? null, raw: content, ...classifyAdjustment(content) });
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
