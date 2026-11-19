/**
 * FreshRSS (and any Google Reader-compatible server) subscription discovery.
 *
 * FreshRSS exposes the classic Google Reader API under `/api/greader.php`.
 * Auth is the legacy ClientLogin flow: POST credentials once, exchange the
 * returned `Auth` token for a short-lived `T` token, then call
 * `subscription/list` which returns every subscribed feed with titles and
 * folder (category) labels.
 *
 * This module only *lists* subscriptions. Import goes through the existing
 * OPML pipeline, so nothing is stored here — the server URL and password are
 * used once per request and never persisted.
 */
const GREADER_TIMEOUT_MS = 20_000;

/** Normalize a user-entered FreshRSS base URL to the API origin. */
export function apiRootOf(baseUrl) {
  const trimmed = String(baseUrl ?? '').trim().replace(/\/+$/, '');
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('FreshRSS 地址必须是合法 URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('FreshRSS 地址必须是 http(s) URL');
  if (url.username || url.password) throw new Error('FreshRSS 地址不应包含用户名或密码');
  // /api/greader.php is the standard endpoint; tolerate users who pasted it.
  if (/\/api\/greader\.php$/i.test(url.pathname)) return url.origin;
  return url.origin;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = GREADER_TIMEOUT_MS) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (!response.ok) {
    let detail = '';
    if (response.status === 401 || response.status === 403) detail = '（用户名或应用密码错误）';
    if (response.status === 404) detail = '（未找到 greader.php，检查 FreshRSS 地址与子路径）';
    throw new Error(`FreshRSS 请求失败 HTTP ${response.status} ${detail}`.trim());
  }
  return response;
}

/** ClientLogin: exchange username + app password for an Auth token. */
async function clientLogin(apiRoot, username, password) {
  const body = new URLSearchParams({
    Email: username,
    Passwd: password,
    client: 'qiaomu-rss-dsh',
    accountType: 'HOSTED_OR_GOOGLE',
    output: 'json',
  });
  const response = await fetchWithTimeout(`${apiRoot}/api/greader.php/accounts/ClientLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: String(body),
  });
  const text = await response.text();
  // FreshRSS returns `SID=...\nLSID=...\nAuth=...`; tolerate json output too.
  const auth = /Auth=([^\s]+)/.exec(text)?.[1];
  if (!auth) throw new Error('FreshRSS 登录失败：响应中没有 Auth token');
  return auth;
}

/** Stream/list returns JSON `{ subscriptions: [{ id, title, url, categories }] }`. */
export async function listFreshRssSubscriptions({ server, username, password }) {
  const apiRoot = apiRootOf(server);
  if (!username) throw new Error('请填写 FreshRSS 用户名');
  if (!password) throw new Error('请填写 FreshRSS 密码（建议使用应用密码）');
  const auth = await clientLogin(apiRoot, username, password);
  const response = await fetchWithTimeout(`${apiRoot}/api/greader.php/reader/api/0/subscription/list?output=json`, {
    headers: { Authorization: `GoogleLogin auth=${auth}` },
  });
  const payload = await response.json();
  const subscriptions = Array.isArray(payload?.subscriptions) ? payload.subscriptions : [];
  if (subscriptions.length === 0) throw new Error('FreshRSS 账户里没有订阅');
  return subscriptions.map((sub) => ({
    url: String(sub.url ?? ''),
    name: String(sub.title ?? '').trim() || String(sub.url ?? ''),
    group: Array.isArray(sub.categories) && sub.categories.length > 0
      ? sub.categories.map((category) => String(category.label ?? '').trim()).filter(Boolean).join(' / ')
      : undefined,
  })).filter((sub) => /^https?:\/\//i.test(sub.url));
}
