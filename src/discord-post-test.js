import { readFile } from 'node:fs/promises';
const secret = process.env.DISCORD_TEST_WEBHOOK_URL;
if (!secret) throw new Error('DISCORD_TEST_WEBHOOK_URL is missing');
let url;
try { url = new URL(secret); } catch { throw new Error('Invalid webhook URL'); }
if (url.origin !== 'https://discord.com' || !/^\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(url.pathname)) throw new Error('Unexpected webhook URL');
url.search = '';
url.searchParams.set('wait', 'true');
const png = await readFile('output/render-test.png');
const form = new FormData();
form.append('payload_json', JSON.stringify({
  content: '【HTML2Discord 投稿テスト】\nPNG画像1枚の送信テストです。',
  allowed_mentions: { parse: [] },
  attachments: [{ id: 0, filename: 'render-test.png' }]
}));
form.append('files[0]', new Blob([png], { type: 'image/png' }), 'render-test.png');
let response;
try {
  response = await fetch(url, { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(30000) });
} catch { throw new Error('Discord request failed; delivery may be uncertain. Check the test channel before rerunning.'); }
if (!response.ok) throw new Error('Discord returned HTTP ' + response.status);
const result = await response.json();
if (!result.id || result.attachments?.length !== 1 || result.attachments[0].filename !== 'render-test.png') throw new Error('Unexpected Discord response; check the test channel before rerunning.');
console.log('Discord PNG post test passed. HTTP ' + response.status + ', message ID: ' + result.id);
