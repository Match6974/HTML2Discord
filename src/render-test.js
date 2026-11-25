import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.setContent('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>body{margin:0;height:100vh;display:grid;place-items:center;background:#172033;color:white;font:48px sans-serif}h1{font-size:64px}</style></head><body><main><h1>HTML2Discord</h1><p>Playwright render test</p><p>1920 x 1080</p></main></body></html>');
  await page.evaluate(() => document.fonts.ready);
  await mkdir('output', { recursive: true });
  await page.screenshot({ path: 'output/render-test.png', type: 'png' });
  console.log('PNG generated: output/render-test.png');
} finally {
  await browser.close();
}
