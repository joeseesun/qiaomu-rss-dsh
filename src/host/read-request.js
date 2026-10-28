const PRIMARY = 'https://rss.qiaomu.ai';
const EDGE = 'https://rss-edge.qiaomu.ai';
const pending = new Map();
let preferred = PRIMARY, preferredUntil = 0;

function canRecover(url) {
  return [PRIMARY, EDGE].includes(url.origin) && !url.username && !url.password &&
    /^\/api\/(?:sources|entries|sources\/[\w-]+\/entries|entry\/[\w-]+(?:\/(?:rewrite|translation))?)$/.test(url.pathname) &&
    [...url.searchParams.keys()].every(key => ['limit', 'cursor', 'source', 'category', 'q', 'ready', 'summary', 'optIn'].includes(key));
}

/** Anonymous reads only. Coalescing covers response bodies, recovery and deadlines. */
export function readJson(url) {
  if (pending.has(url)) return pending.get(url);
  const request = perform(url).finally(() => { if (pending.get(url) === request) pending.delete(url); });
  pending.set(url, request);
  return request;
}

async function perform(raw) {
  const url = new URL(raw), eligible = canRecover(url);
  const first = eligible && preferredUntil > Date.now() ? preferred : url.origin;
  const origins = eligible ? [first, first === PRIMARY ? EDGE : PRIMARY] : [url.origin];
  const deadline = Date.now() + 20_000;
  for (let attempt = 0; attempt < origins.length; attempt++) {
    const target = new URL(url); if (eligible) target.host = new URL(origins[attempt]).host;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DOMException('Reading request timed out', 'TimeoutError')),
      Math.min(deadline - Date.now(), eligible && attempt === 0 ? 6000 : 20000));
    try {
      const response = await fetch(target.href, {
        signal: controller.signal, credentials: 'omit', redirect: 'error',
        headers: { accept: 'application/json', ...(url.pathname.endsWith('/entries') ? { 'X-Rss-List': 'reader-v1' } : {}) },
      });
      if (!response.ok) throw Object.assign(new Error(`qiaomu api ${url.pathname} failed: HTTP ${response.status}`), { status: response.status });
      if (Number(response.headers.get('content-length')) > 12_000_000) throw new Error('Reading response is too large');
      const text = await response.text();
      if (text.length > 12_000_000) throw new Error('Reading response is too large');
      const data = JSON.parse(text);
      if (eligible) { preferred = target.origin; preferredUntil = Date.now() + 300_000; }
      return data;
    } catch (error) {
      const transient = controller.signal.aborted || error instanceof TypeError || [408, 502, 504].includes(error.status);
      if (!transient || attempt + 1 === origins.length || Date.now() >= deadline) throw error;
    } finally { clearTimeout(timeout); }
  }
}
