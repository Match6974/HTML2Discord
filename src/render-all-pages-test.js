import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildPatchNoteHtml } from './patch-note-html.js';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await mkdir('output/all-pages', { recursive: true });
  const results = [];
  let totalPages;
  for (let n = 1; n <= (totalPages ?? 1); n++) {
    await page.goto('about:blank');
    await page.setContent(buildPatchNoteHtml({ testCardCount: 5, requestedPageFromWorker: n }), { waitUntil: 'load' });
    await page.waitForSelector("body[data-render-ready='true']", { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => {
      const footer = document.querySelector('.footer-page');
      const header = document.querySelector('.page-number');
      const body = document.querySelector('.page');
      const footerTop = footer?.closest('.footer')?.getBoundingClientRect().top;
      const rects = [...body.children].map(el => el.getBoundingClientRect());
      return { selectedPage: window.selectedPage, pagination: window.paginationResult, pageError: window.pageError, header: header?.textContent.trim(), footer: footer?.textContent.trim(), cardCount: body.querySelectorAll('.skill-card').length, contentBottom: Math.max(...rects.map(r => r.bottom)), contentRight: Math.max(...rects.map(r => r.right)), contentLeft: Math.min(...rects.map(r => r.left)), footerTop: footerTop ?? window.layoutCheck.footerTop };
    });
    if (n === 1) totalPages = result.pagination?.totalPages;
    if (!Number.isSafeInteger(totalPages) || totalPages < 1 || totalPages > 100) throw new Error('Invalid total pages');
    const expected = String(n).padStart(2, '0') + ' / ' + String(totalPages).padStart(2, '0');
    const info = result.pagination?.pages?.[n - 1];
    if (result.pageError || result.selectedPage !== n || result.pagination?.totalPages !== totalPages || !info || info.belowMinimumScale || result.header !== expected || result.footer !== expected || result.cardCount !== info.cardCount || result.contentBottom > result.footerTop - 24 || result.contentRight > 1872 || result.contentLeft < 0) throw new Error(JSON.stringify(result));
    const filename = 'page-' + String(n).padStart(2, '0') + '.png';
    const png = await page.screenshot({ path: 'output/all-pages/' + filename, type: 'png' });
    if (png.readUInt32BE(16) !== 1920 || png.readUInt32BE(20) !== 1080) throw new Error('Unexpected PNG dimensions');
    results.push({ filename, ...info, contentBottom: result.contentBottom, footerTop: result.footerTop });
    console.log('Generated ' + filename + ' (' + expected + ')');
  }
  if (results.reduce((sum, p) => sum + p.cardCount, 0) !== 5) throw new Error('Unexpected total card count');
  await writeFile('output/all-pages/layout-results.json', JSON.stringify({ totalPages, pages: results }, null, 2));
} finally { await browser.close(); }
