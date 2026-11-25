import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fetchNews } from './fetch-news.js';

const url = process.env.NEWS_URL;
if (!url) throw new Error('NEWS_URL is required');
await mkdir('output/news-inspect', { recursive: true });
try {
  const { html } = await fetchNews(url);
  await writeFile('output/news-inspect/source.html', html);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ javaScriptEnabled: false });
    await page.route('**/*', route => route.abort());
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const report = await page.evaluate(() => {
      const describe = el => ({ tag: el.tagName.toLowerCase(), id: el.id, className: el.getAttribute('class'), text: el.innerText ?? el.textContent });
      return {
        title: document.title,
        headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(describe),
        containers: [...document.querySelectorAll('main,article,[role="main"]')].map(describe),
        blocks: [...document.querySelectorAll('p,li,td,th,dt,dd')].map(describe),
        bodyText: document.body.innerText
      };
    });
    await writeFile('output/news-inspect/structure.json', JSON.stringify({ url, ...report }, null, 2));
    await writeFile('output/news-inspect/body.txt', report.bodyText);
    console.log(JSON.stringify({ title: report.title, headings: report.headings, containers: report.containers.map(({text,...rest}) => ({...rest, length:text.length})), blocks: report.blocks.length }, null, 2));
    if (!report.bodyText.trim()) throw new Error('No visible body text');
  } finally { await browser.close(); }
} catch (error) {
  await writeFile('output/news-inspect/error.txt', String(error.stack ?? error));
  throw error;
}
