// Speech-recognition services, ported from Qiaomu Clipper (src/utils/asr-settings.ts, native/asr_cloud.py).
// No Obsidian imports: labels and notes are i18n keys resolved by the UI.
// Tried with real keys in Clipper on a 5-minute Chinese lecture: SiliconFlow, Doubao, GLM, StepFun, MiMo.
// Groq and OpenAI follow the published OpenAI-style API but were not tried there.
export const ASR_PROVIDERS = [
  { id: 'siliconflow', label: 'asr.provider.siliconflow', protocol: 'openai-transcriptions', baseUrl: 'https://api.siliconflow.cn/v1', defaultModel: 'Qwen/Qwen3-ASR-1.7B', models: ['Qwen/Qwen3-ASR-1.7B', 'FunAudioLLM/SenseVoiceSmall', 'XingChenAGI/XingChenASR-V3.2'], keyHelp: 'https://cloud.siliconflow.cn/account/ak', note: 'asr.note.siliconflow' },
  { id: 'doubao', label: 'asr.provider.doubao', protocol: 'doubao-flash', baseUrl: 'https://openspeech.bytedance.com/api/v3', defaultModel: 'bigmodel', models: ['bigmodel'], chunkSeconds: 300, maxChunkSeconds: 540, keyHelp: 'https://console.volcengine.com/speech/new/experience/asr', note: 'asr.note.doubao' },
  { id: 'glm', label: 'asr.provider.glm', protocol: 'openai-transcriptions', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-asr-2512', models: ['glm-asr-2512'], chunkSeconds: 18, maxChunkSeconds: 28, keyHelp: 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys', note: 'asr.note.glm' },
  { id: 'stepfun', label: 'asr.provider.stepfun', protocol: 'openai-transcriptions', baseUrl: 'https://api.stepfun.com/v1', defaultModel: 'stepaudio-2.5-asr', models: ['stepaudio-2.5-asr', 'step-asr'], keyHelp: 'https://platform.stepfun.com/interface-key' },
  { id: 'mimo', label: 'asr.provider.mimo', protocol: 'chat-audio', baseUrl: 'https://api.xiaomimimo.com/v1', defaultModel: 'mimo-v2.5-asr', models: ['mimo-v2.5-asr'], keyHelp: 'https://platform.xiaomimimo.com/', note: 'asr.note.mimo' },
  { id: 'groq', label: 'Groq (Whisper)', protocol: 'openai-transcriptions', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'whisper-large-v3-turbo', models: ['whisper-large-v3-turbo', 'whisper-large-v3'], keyHelp: 'https://console.groq.com/keys', languageParam: true },
  { id: 'openai', label: 'OpenAI', protocol: 'openai-transcriptions', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini-transcribe', models: ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1'], keyHelp: 'https://platform.openai.com/api-keys', languageParam: true },
  { id: 'local', label: 'asr.provider.local', protocol: 'openai-transcriptions', baseUrl: 'http://127.0.0.1:8765/v1', defaultModel: 'Qwen/Qwen3-ASR-0.6B', models: ['Qwen/Qwen3-ASR-0.6B', 'whisper-1'], note: 'asr.note.local' },
  { id: 'custom', label: 'asr.provider.custom', protocol: 'openai-transcriptions', baseUrl: '', defaultModel: '', models: [], note: 'asr.note.custom' },
];
export const PROTOCOLS = ['openai-transcriptions', 'chat-audio', 'doubao-flash'];
export const ASR_LANGUAGES = ['auto', 'zh', 'en', 'ja', 'ko', 'yue', 'de', 'fr', 'es'];
export const MAX_PROFILES = 12;
export const providerOf = id => ASR_PROVIDERS.find(p => p.id === id) || ASR_PROVIDERS[ASR_PROVIDERS.length - 1];

export function asrError(code, detail) { return Object.assign(new Error(code), { code, detail }); }
export function isLocalUrl(value) {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname); } catch { return false; }
}
export function asrBaseUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw asrError('url'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw asrError('url');
  if (url.protocol === 'http:' && !isLocalUrl(url.href)) throw asrError('https');
  return url.href.replace(/\/+$/, '').replace(/\/audio\/transcriptions$/, '');
}

const newId = () => 'p' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
export function newProfile(provider = 'siliconflow') {
  const info = providerOf(provider);
  return { id: newId(), provider: info.id, baseUrl: info.baseUrl, model: info.defaultModel, protocol: info.protocol };
}
// Choosing a service fills in its address and recommended model; the key is stored separately and stays.
export function withProvider(profile, id) {
  const info = providerOf(id);
  return { ...profile, provider: info.id, baseUrl: info.baseUrl, model: info.defaultModel, protocol: info.protocol };
}
export function cleanProfile(value, taken = new Set()) {
  if (!value || typeof value !== 'object') return null;
  const info = providerOf(String(value.provider || 'siliconflow'));
  let id = typeof value.id === 'string' && /^[a-z0-9-]{1,24}$/.test(value.id) ? value.id : newId();
  while (taken.has(id)) id = newId();
  taken.add(id);
  return {
    id, provider: info.id,
    baseUrl: typeof value.baseUrl === 'string' && value.baseUrl.trim() ? value.baseUrl.trim().slice(0, 300) : info.baseUrl,
    model: typeof value.model === 'string' && value.model.trim() ? value.model.trim().slice(0, 100) : info.defaultModel,
    protocol: info.id === 'custom' && PROTOCOLS.includes(value.protocol) ? value.protocol : info.protocol,
    ...(typeof value.name === 'string' && value.name.trim() ? { name: value.name.trim().slice(0, 40) } : {}),
  };
}
// What one request needs to know about a saved service. The key travels separately.
export function cloudConfig(profile) {
  const info = providerOf(profile.provider);
  const base = asrBaseUrl(profile.baseUrl);
  if (!/^[A-Za-z0-9_./:-]{1,100}$/.test(profile.model || '')) throw asrError('model');
  return {
    protocol: profile.protocol || info.protocol, baseUrl: base, model: profile.model,
    languageParam: !!info.languageParam, local: isLocalUrl(base),
    chunkSeconds: info.chunkSeconds || 20, maxChunkSeconds: info.maxChunkSeconds || 40,
  };
}
