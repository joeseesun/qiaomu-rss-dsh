import { models } from './models.json';
const registry={models};
export const LOCAL_MODELS = Object.entries(registry.models).filter(([, value]) => value.kind !== 'asr').map(([id, value]) => ({ id, ...value }));
export const ASR_MODELS = Object.entries(registry.models).filter(([, value]) => value.kind === 'asr').map(([id, value]) => ({ id, ...value }));
export const LOCAL_ASR_MODEL = 'sensevoice';
export const LOCAL_DEFAULT_MODEL = 'kokoro';
export const LOCAL_DEFAULT_VOICE = registry.models.kokoro.defaultVoice;
export function normalizeLocalProfile(profile = {}) {
  const model = registry.models[profile.model]?.kind !== 'asr' && registry.models[profile.model] ? profile.model : LOCAL_DEFAULT_MODEL;
  const voice = registry.models[model].voices.some(v => v.id === profile.voice) ? profile.voice : registry.models[model].defaultVoice;
  return { ...profile, model, voice };
}
export function localVoiceChoices(model, chinese = true) {
  return (registry.models[model]?.voices || []).map(v => {
    const language = !chinese ? v.lang : !v.lang.startsWith('zh') ? '英文'
      : v.gender === 'male' ? '中文男声' : v.gender === 'female' ? '中文女声' : '';
    return { id: v.id, label: [chinese ? v.name : v.nameEn, language,
      v.recommended ? chinese ? '推荐' : 'Recommended' : ''].filter(Boolean).join(' · '),
    sourceName: `${registry.models[model].label} · ${v.id}`, recommended: !!v.recommended };
  });
}
