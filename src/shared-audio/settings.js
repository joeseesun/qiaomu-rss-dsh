import { TTS_PROVIDERS } from './core/tts/providers.js';
import { ASR_LANGUAGES, MAX_PROFILES, cleanProfile } from './core/asr/providers.js';
import { normalizeRecentChoices } from './core/tts/recent.js';
import { cleanAccounts } from './core/share/brand.js';
import { DEFAULT_STYLE, STYLE_IDS } from './core/share/styles.js';

// Keys live in Obsidian's SecretStorage, never in data.json. IDs: lowercase letters, digits and dashes.
export const ttsSecretId = (provider, namespace = 'qiaomu-audio') => `${namespace}-tts-${String(provider).toLowerCase()}`;
export const asrSecretId = (profileId, provider = '') => `qiaomu-audio-dsh-asr-${String(profileId).toLowerCase()}${provider ? `-${String(provider).toLowerCase()}` : ''}`;

// The old profile-only key belongs exclusively to the provider saved with that profile.
export function migrateAsrSecrets(app, profiles) {
  for (const profile of profiles) {
    const old = asrSecretId(profile.id), next = asrSecretId(profile.id, profile.provider);
    const value = getSecret(app, old);
    if (!value) continue;
    try {
      if (!getSecret(app, next)) setSecret(app, next, value);
      setSecret(app, old, '');
    } catch { /* Preserve the old key if the host cannot save the migration. */ }
  }
}
export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function defaultSettings(desktop = true) {
  return {
    tts: { provider: desktop ? 'edge' : 'system', profiles: {}, rate: 1, welcomed: false, recent: [] },
    // engine: '' (not chosen yet), 'local' (SenseVoice on this computer) or 'cloud:<profile id>'.
    asr: { engine: '', profiles: [], language: 'auto', mode: 'live', keepAudio: true },
    // Last export choices plus the author's signature used on the video cover and end card.
    share: { format: desktop ? 'mp4' : 'mp3', videos: ['portrait'], visual: DEFAULT_STYLE, speed: 1, cover: true, outro: true, srt: false, coverImage: false, embed: true,
      name: '', avatar: '', background: '', folder: '', accounts: [] },
  };
}
export const SHARE_SPEEDS = { min: 0.75, max: 2, step: 0.05 };
const cleanText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
function normalizeShare(raw, base, desktop) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}, flag = (key) => (typeof value[key] === 'boolean' ? value[key] : base[key]);
  const speed = Math.round(Number(value.speed) / SHARE_SPEEDS.step) * SHARE_SPEEDS.step;
  const videos = (Array.isArray(value.videos) ? value.videos : []).filter((v, i, all) => ['portrait', 'landscape'].includes(v) && all.indexOf(v) === i);
  return {
    format: value.format === 'mp3' || !desktop ? 'mp3' : 'mp4', videos: videos.length ? videos : base.videos, visual: STYLE_IDS.includes(value.visual) ? value.visual : DEFAULT_STYLE,
    speed: speed >= SHARE_SPEEDS.min && speed <= SHARE_SPEEDS.max ? Math.round(speed * 100) / 100 : 1,
    cover: flag('cover'), outro: flag('outro'), srt: flag('srt'), coverImage: flag('coverImage'), embed: flag('embed'),
    name: cleanText(value.name, 40), avatar: cleanText(value.avatar, 300), background: cleanText(value.background, 300), folder: desktop ? cleanText(value.folder, 500) : '', accounts: cleanAccounts(value.accounts),
  };
}
export function normalizeSettings(raw, desktop = true) {
  const base = defaultSettings(desktop), value = raw && typeof raw === 'object' ? raw : {};
  const tts = { ...base.tts, ...(value.tts && typeof value.tts === 'object' ? value.tts : {}) };
  if (!TTS_PROVIDERS[tts.provider]) tts.provider = base.tts.provider;
  if (!tts.profiles || typeof tts.profiles !== 'object' || Array.isArray(tts.profiles)) tts.profiles = {};
  tts.profiles = Object.fromEntries(Object.entries(tts.profiles).filter(([id, p]) => TTS_PROVIDERS[id] && p && typeof p === 'object' && !Array.isArray(p)).map(([id, p]) => [id, Object.fromEntries(['voice', 'model', 'baseUrl', 'region', 'resourceId'].filter(key => typeof p[key] === 'string').map(key => [key, p[key]]))]));
  tts.rate = RATES.includes(Number(tts.rate)) ? Number(tts.rate) : 1;
  tts.welcomed = tts.welcomed === true;
  tts.recent = normalizeRecentChoices(tts.recent);

  const source = value.asr && typeof value.asr === 'object' ? value.asr : {};
  const taken = new Set();
  const profiles = (Array.isArray(source.profiles) ? source.profiles : []).slice(0, MAX_PROFILES)
    .map(p => cleanProfile(p, taken)).filter(Boolean);
  let engine = typeof source.engine === 'string' ? source.engine : '';
  if (engine === 'local' && !desktop) engine = '';
  if (engine.startsWith('cloud:') && !profiles.some(p => `cloud:${p.id}` === engine)) engine = profiles[0] ? `cloud:${profiles[0].id}` : '';
  if (engine && engine !== 'local' && !engine.startsWith('cloud:')) engine = '';
  return {
    tts: {provider:tts.provider,profiles:tts.profiles,rate:tts.rate,welcomed:tts.welcomed,recent:tts.recent},
    share: normalizeShare(value.share, base.share, desktop),
    readingProgress: value.readingProgress && typeof value.readingProgress === 'object' && !Array.isArray(value.readingProgress) ? value.readingProgress : {},
    asr: {
      engine, profiles,
      language: ASR_LANGUAGES.includes(source.language) ? source.language : 'auto',
      mode: ['live', 'batch'].includes(source.mode) ? source.mode : base.asr.mode,
      keepAudio: typeof source.keepAudio === 'boolean' ? source.keepAudio : base.asr.keepAudio,
    },
  };
}
export function getSecret(app, id) {
  try { return app.secretStorage?.getSecret(id) || ''; } catch { return ''; }
}
export function setSecret(app, id, value) {
  return app.secretStorage.setSecret(id, String(value || '').trim());
}
