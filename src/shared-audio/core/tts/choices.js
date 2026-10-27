import { awaitSpeechRequest, checkTtsSignal, ttsBaseUrl, ttsError } from './providers.js';

// Curated protocol-compatible presets, checked against official docs 2026-10-12.
// See docs/tts-research-2026-10-12.md. Account catalogs supplement these presets.
const entries = values => values.map(value => typeof value === 'string' ? { id: value, label: value } : { id: value[0], label: value[1] });
export const TTS_MODELS = {
  openai: entries(['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd']),
  compatible: [],
  qwen: entries(['qwen3-tts-flash', 'qwen3-tts-instruct-flash', 'qwen-tts']),
  doubao: entries([['seed-tts-2.0', 'Seed TTS 2.0'], ['seed-tts-1.0', 'Seed TTS 1.0']]),
  minimax: entries(['speech-2.8-hd', 'speech-2.8-turbo', 'speech-2.6-hd', 'speech-2.6-turbo', 'speech-02-hd', 'speech-02-turbo']),
  siliconflow: entries([['FunAudioLLM/CosyVoice2-0.5B', 'CosyVoice 2 · 0.5B'], ['fnlp/MOSS-TTSD-v0.5', 'MOSS TTSD · v0.5']]),
  elevenlabs: entries(['eleven_multilingual_v2', 'eleven_v3', 'eleven_v4', 'eleven_v4_turbo', 'eleven_flash_v2_5', 'eleven_turbo_v2_5']),
};
const microsoft = entries([
  ['zh-CN-XiaoxiaoNeural', '晓晓 · 中文女声'], ['zh-CN-YunxiNeural', '云希 · 中文男声'], ['zh-CN-YunjianNeural', '云健 · 中文男声'],
  ['zh-CN-XiaoyiNeural', '晓伊 · 中文女声'], ['zh-TW-HsiaoChenNeural', '曉臻 · 台灣女聲'], ['zh-HK-HiuMaanNeural', '曉曼 · 粵語女聲'],
  ['en-US-JennyNeural', 'Jenny · English'], ['en-US-GuyNeural', 'Guy · English'],
]);
const doubao2 = entries([
  ['zh_female_vv_uranus_bigtts', 'Vivi 2.0'], ['zh_female_xiaohe_uranus_bigtts', '小何 2.0'],
  ['zh_male_m191_uranus_bigtts', '云舟 2.0'], ['zh_male_taocheng_uranus_bigtts', '小天 2.0'],
  ['zh_male_liufei_uranus_bigtts', '刘飞 2.0'], ['zh_female_qingxinnvsheng_uranus_bigtts', '清新女声 2.0'],
  ['zh_female_shuangkuaisisi_uranus_bigtts', '爽快思思 2.0'], ['zh_female_tianmeitaozi_uranus_bigtts', '甜美桃子 2.0'],
  ['en_male_tim_uranus_bigtts', 'Tim · English'], ['en_female_dacey_uranus_bigtts', 'Dacey · English'],
]);
const doubao1 = entries([['zh_female_shuangkuaisisi_moon_bigtts', '爽快思思'], ['zh_male_wennuanahu_moon_bigtts', '温暖阿虎'], ['zh_female_wanwanxiaohe_moon_bigtts', '湾湾小何']]);
const silicon = entries([['alex', 'Alex · 沉稳男声'], ['benjamin', 'Benjamin · 低沉男声'], ['charles', 'Charles · 磁性男声'], ['david', 'David · 欢快男声'], ['anna', 'Anna · 沉稳女声'], ['bella', 'Bella · 热情女声'], ['claire', 'Claire · 温柔女声'], ['diana', 'Diana · 欢快女声']]);
export function modelKey(profile) { return profile.id === 'doubao' ? 'resourceId' : 'model'; }
export function voiceChoices(profile, catalog = {}) {
  const { id, model, resourceId } = profile;
  let voices = [];
  const known = TTS_MODELS[id]?.some(entry => entry.id === model);
  if (id === 'edge' || id === 'azure') voices = microsoft;
  if (id === 'openai' && known) voices = entries(/^tts-1/.test(model) ? ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] : ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);
  if (id === 'qwen' && known) voices = entries(['Cherry', 'Serena', 'Ethan', 'Chelsie']);
  if (id === 'doubao') voices = resourceId === 'seed-tts-2.0' ? doubao2 : resourceId === 'seed-tts-1.0' ? doubao1 : [];
  if (id === 'siliconflow' && /(?:CosyVoice2-0\.5B|MOSS-TTSD-v0\.5)$/.test(model)) voices = silicon.map(v => ({ ...v, id: `${model}:${v.id}` }));
  if (id === 'minimax' && known) voices = entries([['male-qn-qingse', '青涩青年'], ['Chinese (Mandarin)_Reliable_Executive', '沉稳高管'], ['Chinese (Mandarin)_News_Anchor', '新闻女声']]);
  if (id === 'elevenlabs' && known) voices = entries([['JBFqnCBsd6RMkjVDRZzb', 'George']]);
  return uniqueChoices([...voices, ...(catalog.voices || []).filter(v => !v.model || v.model === model)]);
}
export function uniqueChoices(values) {
  return [...new Map(values.filter(v => typeof v.id === 'string' && v.id.length <= 512).map(v => [v.id, { ...v, label: String(v.label || v.id).slice(0, 180) }])).values()];
}
export function changeSpeechModel(profile, value, catalog) {
  const next = { ...profile, [modelKey(profile)]: value }, voices = voiceChoices(next, catalog);
  // A model-scoped voice must never be carried into another model accidentally.
  // Custom unknown models require an explicit voice instead of a guessed ID.
  const previous = profile.voice?.split(':').pop();
  next.voice = voices.some(v => v.id === profile.voice) ? profile.voice
    : voices.find(v => v.id.endsWith(`:${previous}`))?.id || voices[0]?.id || '';
  return next;
}
export function canLoadVoiceCatalog(id) { return ['siliconflow', 'minimax', 'elevenlabs', 'azure'].includes(id); }
export async function loadVoiceCatalog(profile, { request, key, signal }) {
  if (!key) throw ttsError('key');
  const { id } = profile;
  const get = async (url, headers, body) => {
    checkTtsSignal(signal);
    const response = await awaitSpeechRequest(request({ url, method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}), throw: false }), signal);
    checkTtsSignal(signal);
    if (response.status < 200 || response.status >= 300) throw ttsError('http', response.status);
    return response.json;
  };
  if (id === 'azure') {
    if (!/^[a-z0-9-]+$/.test(profile.region || '')) throw ttsError('region');
    const body = await get(`https://${profile.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, { 'Ocp-Apim-Subscription-Key': key });
    if (!Array.isArray(body)) throw ttsError('response');
    return { voices: uniqueChoices(body.map(v => ({ id: v.ShortName, label: `${v.LocalName || v.DisplayName} · ${v.Locale}` }))) };
  }
  const base = ttsBaseUrl(profile.baseUrl), bearer = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (id === 'minimax') {
    const body = await get(`${base}/get_voice`, bearer, { voice_type: 'all' });
    if (body?.base_resp?.status_code !== 0) throw ttsError('service', body?.base_resp?.status_code);
    return { voices: uniqueChoices(['system_voice', 'voice_cloning', 'voice_generation'].flatMap(k => body[k] || []).map(v => ({ id: v.voice_id, label: v.voice_name || v.voice_id }))) };
  }
  if (id === 'siliconflow') {
    const body = await get(`${base}/audio/voice/list`, bearer);
    if (!Array.isArray(body?.results)) throw ttsError('response');
    const models = await get(`${base}/models?type=audio`, bearer);
    if (!Array.isArray(models?.data)) throw ttsError('response');
    return { models: uniqueChoices(models.data.filter(m => m.sub_type === 'text-to-speech' || /tts|cosyvoice|fish-speech|kokoro/i.test(m.id)).map(m => ({ id: m.id, label: m.id }))),
      voices: uniqueChoices(body.results.map(v => ({ id: v.uri, label: v.customName, model: v.model }))) };
  }
  if (id === 'elevenlabs') {
    const headers = { 'xi-api-key': key };
    const models = await get(`${base}/models`, headers);
    if (!Array.isArray(models)) throw ttsError('response');
    let voices = [], token = '', pages = 0;
    do {
      const body = await get(`${base.replace(/\/v1$/, '/v2')}/voices?page_size=100${token ? `&next_page_token=${encodeURIComponent(token)}` : ''}`, headers);
      if (!Array.isArray(body?.voices)) throw ttsError('response');
      voices.push(...body.voices); token = body.has_more ? body.next_page_token : '';
    } while (token && ++pages < 10);
    return { models: uniqueChoices(models.filter(m => m.can_do_text_to_speech).map(m => ({ id: m.model_id, label: m.name }))),
      voices: uniqueChoices(voices.map(v => ({ id: v.voice_id, label: v.name }))), more: !!token };
  }
  throw ttsError('configuration');
}
