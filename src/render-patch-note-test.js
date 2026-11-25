import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildPatchNoteHtml } from './patch-note-html.js';

const browser = await chromium.launch({ headless: true });
try {
  await mkdir('output', { recursive: true });
  const results = [];
  for (const [testCardCount, requestedPageFromWorker] of [[1, 1], [5, 3]]) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    try {
      page.on('pageerror', error => console.error(error));
      await page.setContent(buildPatchNoteHtml({ testCardCount, requestedPageFromWorker }), { waitUntil: 'load' });
      await page.waitForSelector("body[data-render-ready='true']", { timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(() => ({ selectedPage: window.selectedPage, pagination: window.paginationResult, layout: window.layoutCheck, pageError: window.pageError }));
      if (result.pageError || result.selectedPage !== requestedPageFromWorker || result.pagination?.totalPages !== testCardCount) throw new Error(JSON.stringify(result));
      if (result.pagination.pages.some(p => p.belowMinimumScale)) throw new Error('Page below minimum scale');
      await page.screenshot({ path: 'output/cards-' + testCardCount + '-page-' + requestedPageFromWorker + '.png', type: 'png' });
      results.push(result);
    } finally { await page.close(); }
  }
  await writeFile('output/layout-results.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
