import { getLanguage } from '../client/original-ui.ts';

import { STRINGS } from './strings.js';

export { STRINGS };
let language = 'en';
export function initLanguage(value) {
  let code = value;
  if (code === undefined) { try { code = getLanguage(); } catch { code = 'en'; } }
  language = /^zh/i.test(String(code || '')) ? 'zh' : 'en';
  return language;
}
export function currentLanguage() { return language; }
export function t(key, params = {}) {
  const pair = STRINGS[key];
  if (!pair) return key;
  return pair[language === 'zh' ? 0 : 1].replace(/\{(\w+)\}/g, (all, name) => params[name] === undefined ? '' : String(params[name]));
}
// Error codes from core modules map to error.<code>; HTTP 429 and Edge 403 get specific advice.
export function errorText(error, provider) {
  if (!error) return t('error.network');
  if (error.status === 429 && error.retryAt > Date.now()) {
    return t('error.rateLimitUntil', { time: new Date(error.retryAt).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US') });
  }
  if (error.status === 429 || error.code === 'rateLimit') return t('error.rateLimit');
  if (provider === 'edge' && error.status === 403) return t('error.edge403');
  if ([401, 403].includes(error.status)) return t('error.auth');
  if (error.status === 402) return t('error.quota');
  if (error.status >= 500) return t('error.server', { detail: error.status });
  const key = `error.${error.code}`;
  if (!STRINGS[key]) return t('error.network');
  return t(key, { status: error.status ?? error.detail ?? '', detail: error.detail || error.status || '' });
}
