// Retrieve official NEWS HTML without modifying the source.
export async function fetchNews(url) {
  const target = new URL(url);
  if (target.origin !== 'https://mhaur.bn-ent.net' || !target.pathname.startsWith('/news/')) throw new Error('Only official NEWS URLs are allowed');
  const response = await fetch(target, { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'HTML2Discord/0.1 (news inspection)' } });
  if (!response.ok) throw new Error('NEWS HTTP ' + response.status);
  if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('Expected HTML');
  const html = await response.text();
  if (!html.trim()) throw new Error('Empty HTML');
  return { url: target.href, html };
}
