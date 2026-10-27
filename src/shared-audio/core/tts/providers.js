import { alignWords } from './timing.js';
// Synthesis only. Playback speed and reading position belong to the controller.
export const TTS_PROVIDERS = Object.freeze({
  system: { label: 'System voice', voice: '', model: '' },
  macos: { label: 'Mac local speech', voice: '', model: '' },
  localModel: { label: 'Local models', voice: 'zf_001', model: 'kokoro' },
  edge: { label: 'Edge TTS', voice: 'zh-CN-XiaoxiaoNeural', model: '' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini-tts', voice: 'coral' },
  compatible: { label: 'OpenAI-compatible', baseUrl: '', model: '', voice: '' },
  qwen: { label: 'Qwen TTS', baseUrl: 'https://dashscope.aliyuncs.com/api/v1', model: 'qwen3-tts-flash', voice: 'Cherry' },
  doubao: { label: 'Doubao', baseUrl: 'https://openspeech.bytedance.com/api/v3/tts', resourceId: 'seed-tts-2.0', voice: 'zh_female_vv_uranus_bigtts' },
  minimax: { label: 'MiniMax', baseUrl: 'https://api.minimax.cn/v1', model: 'speech-2.8-hd', voice: 'male-qn-qingse' },
  siliconflow: { label: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/CosyVoice2-0.5B', voice: 'FunAudioLLM/CosyVoice2-0.5B:alex' },
  elevenlabs: { label: 'ElevenLabs', baseUrl: 'https://api.elevenlabs.io/v1', model: 'eleven_multilingual_v2', voice: 'JBFqnCBsd6RMkjVDRZzb' },
  azure: { label: 'Azure Speech', region: '', model: '', voice: 'zh-CN-XiaoxiaoNeural' },
});

export function ttsProfile(settings, id = settings?.provider || 'system') {
  return { ...TTS_PROVIDERS[id], ...settings?.profiles?.[id], id };
}
export function ttsError(code, status) {
  return Object.assign(new Error(code), { code, status });
}
export function checkTtsSignal(signal) {
  if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
}
export function escapeSpeechXml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}
export function ttsBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw ttsError('url'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw ttsError('url');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw ttsError('https');
  return url.href.replace(/\/+$/, '').replace(/\/audio\/speech$/, '');
}
// Word timestamps are an opt-in audio parameter whose name depends on the model generation.
function doubaoTiming(resourceId, enabled) {
  if (!enabled) return {};
  return /2\.0/.test(resourceId) ? { enable_subtitle: true } : /1\.0/.test(resourceId) ? { enable_timestamp: true } : {};
}
export function buildSpeechRequest(profile, text, key = '', timing = false) {
  const { id, voice, model } = profile;
  if (!TTS_PROVIDERS[id] || ['system', 'macos', 'edge'].includes(id)) throw ttsError('provider');
  if (id !== 'compatible' && !key) throw ttsError('key');
  if (!voice || (!['azure', 'doubao'].includes(id) && !model)) throw ttsError('configuration');
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (id === 'azure') {
    if (!/^[a-z0-9-]+$/.test(profile.region || '')) throw ttsError('region');
    return { url: `https://${profile.region}.tts.speech.microsoft.com/cognitiveservices/v1`, method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' },
      body: `<speak version="1.0" xml:lang="${escapeSpeechXml(voice.split('-').slice(0, 2).join('-'))}"><voice name="${escapeSpeechXml(voice)}">${escapeSpeechXml(text)}</voice></speak>` };
  }
  const base = ttsBaseUrl(profile.baseUrl);
  if (id === 'doubao') {
    if (!profile.resourceId) throw ttsError('resource');
    return { url: `${base}/unidirectional`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': key, 'X-Api-Resource-Id': profile.resourceId, 'X-Api-Request-Id': globalThis.crypto.randomUUID() },
      body: JSON.stringify({ req_params: { text, speaker: voice, audio_params: { format: 'mp3', sample_rate: 24000, ...doubaoTiming(profile.resourceId, timing) } } }) };
  }
  if (id === 'minimax') return { url: `${base}/t2a_v2`, method: 'POST', headers,
    body: JSON.stringify({ model, text, stream: false, output_format: 'hex',
      voice_setting: { voice_id: voice, speed: 1, vol: 1, pitch: 0 },
      audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 } }) };
  if (id === 'elevenlabs') return { url: `${base}/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': key }, body: JSON.stringify({ text, model_id: model }) };
  if (id === 'qwen') return { url: `${base}/services/aigc/multimodal-generation/generation`, method: 'POST', headers,
    body: JSON.stringify({ model, input: { text, voice, language_type: 'Auto' } }) };
  return { url: `${base}/audio/speech`, method: 'POST', headers,
    body: JSON.stringify({ model, input: text, voice, response_format: 'mp3' }) };
}

// requestUrl cannot abort the host's network request. Stop waiting immediately,
// discard late results, and never schedule further generation after cancellation.
export function awaitSpeechRequest(promise, signal, timeoutMs = 30000) {
  checkTtsSignal(signal);
  return new Promise((resolve, reject) => {
    const finish = (fn, value) => { globalThis.clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value); };
    const abort = () => finish(reject, Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
    const timer = globalThis.setTimeout(() => finish(reject, ttsError('timeout')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(v => finish(resolve, v), e => finish(reject, e));
  });
}
function validateResponse(response) {
  if (response.status < 200 || response.status >= 300) throw ttsError('http', response.status);
}
function decodeBase64(value) {
  try { return Uint8Array.from(globalThis.atob(value), c => c.charCodeAt(0)); }
  catch { throw ttsError('response'); }
}
function providerFailure(status) { return ttsError('service', status); }
function doubaoOk(text) {
  try { return String(text).split(/\r?\n/).filter(l => l.trim()).every(l => [0, 20000000].includes(JSON.parse(l).code)); } catch { return true; }
}
function decodeDoubao(text, spoken) {
  let messages;
  try { messages = [JSON.parse(text)]; }
  catch {
    try { messages = text.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line)); }
    catch { throw ttsError('response'); }
  }
  const chunks = [], marks = []; let size = 0, cursor = 0, shift = 0, end = 0;
  for (const message of messages) {
    if (![0, 20000000].includes(message.code)) throw providerFailure(message.code);
    const words = message.sentence?.words;
    if (Array.isArray(words) && words.length) {
      // Later sentences normally continue the clock; if one restarts, shift it.
      const first = Number(words[0]?.startTime);
      if (Number.isFinite(first) && first + shift < end - 0.05) shift = end - first;
      const aligned = alignWords(spoken, words.map(w => ({ ...w, startTime: Number(w.startTime) + shift, endTime: Number(w.endTime) + shift })), cursor);
      cursor = aligned.cursor; marks.push(...aligned.marks);
      end = Math.max(end, ...aligned.marks.map(m => m.to), end);
    }
    if (!message.data) continue;
    const bytes = decodeBase64(message.data); size += bytes.length;
    if (size > 8 * 1024 * 1024) throw ttsError('response');
    chunks.push(bytes);
  }
  if (!size) throw ttsError('empty');
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return marks.length ? { bytes, mime: 'audio/mpeg', marks } : { bytes, mime: 'audio/mpeg' };
}
export async function synthesizeHttp(profile, text, { request, key, signal }) {
  checkTtsSignal(signal);
  const timed = profile.id === 'doubao';
  let response = await awaitSpeechRequest(request({ ...buildSpeechRequest(profile, text, key, timed), throw: false }), signal);
  checkTtsSignal(signal);
  // A voice or resource that rejects the timestamp parameter still reads aloud, just unaligned.
  if (timed && (response.status < 200 || response.status >= 300 || !doubaoOk(response.text))) {
    response = await awaitSpeechRequest(request({ ...buildSpeechRequest(profile, text, key, false), throw: false }), signal);
    checkTtsSignal(signal);
  }
  validateResponse(response);
  // Obsidian buffers the HTTP body: join the provider's NDJSON audio packets
  // before playback. This is not a claim of incremental streaming playback.
  if (profile.id === 'doubao') return decodeDoubao(response.text, text);
  if (profile.id === 'minimax') {
    const body = response.json;
    if (body?.base_resp?.status_code !== 0) throw providerFailure(body?.base_resp?.status_code);
    const hex = body?.data?.audio;
    if (!hex) throw ttsError('empty');
    if (typeof hex !== 'string' || hex.length > 16 * 1024 * 1024 || !/^(?:[0-9a-f]{2})+$/i.test(hex)) throw ttsError('response');
    return { bytes: Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16)), mime: 'audio/mpeg' };
  }
  if (profile.id === 'qwen') {
    const body = response.json;
    if (body?.code || (body?.status_code && body.status_code !== 200)) throw ttsError('response');
    const audio = body?.output?.audio;
    if (audio?.data) {
      const bytes = decodeBase64(audio.data);
      if (!bytes.length) throw ttsError('empty');
      return { bytes, mime: 'audio/wav' };
    }
    let url;
    try { url = new URL(audio?.url); } catch { throw ttsError('empty'); }
    // Fetch signed audio without forwarding API credentials. Only accept the
    // provider's storage domains, never a URL into the user's local network.
    if (!url.hostname.endsWith('.aliyuncs.com') || !['http:', 'https:'].includes(url.protocol)) throw ttsError('response');
    url.protocol = 'https:';
    response = await awaitSpeechRequest(request({ url: url.href, throw: false }), signal);
    checkTtsSignal(signal); validateResponse(response);
  }
  const bytes = new Uint8Array(response.arrayBuffer || new ArrayBuffer(0));
  const mime = response.headers?.['content-type'] || response.headers?.['Content-Type'] || 'audio/mpeg';
  if (!bytes.length) throw ttsError('empty');
  if (/json|html|text\//i.test(mime)) throw ttsError('response');
  return { bytes, mime };
}

export class SpeechCache {
  constructor(limit = 20 * 1024 * 1024) { this.limit = limit; this.bytes = 0; this.entries = new Map(); }
  get(key) {
    const value = this.entries.get(key);
    if (value) { this.entries.delete(key); this.entries.set(key, value); }
    return value;
  }
  set(key, value) {
    const size = value.bytes.byteLength;
    if (size > this.limit) return;
    if (this.entries.has(key)) this.bytes -= this.entries.get(key).bytes.byteLength;
    this.entries.delete(key); this.entries.set(key, value); this.bytes += size;
    while (this.bytes > this.limit) { const first = this.entries.keys().next().value; this.bytes -= this.entries.get(first).bytes.byteLength; this.entries.delete(first); }
  }
  clear() { this.entries.clear(); this.bytes = 0; }
}
