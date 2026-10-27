import { TTS_PROVIDERS } from './providers.js';

const FIELDS = ['voice', 'model', 'baseUrl', 'region', 'resourceId'];
const MAX_RECENT = 8;

// Never copy credentials or arbitrary provider response data into history.
export function cleanSpeechChoice(value) {
  if (!value || !Object.hasOwn(TTS_PROVIDERS, value.id)) return null;
  return { id: value.id, ...Object.fromEntries(FIELDS.filter(key => typeof value[key] === 'string' && value[key].length <= 1000).map(key => [key, value[key]])) };
}
export function speechChoiceKey(value) {
  return JSON.stringify([value.id, ...FIELDS.map(key => value[key] ?? TTS_PROVIDERS[value.id]?.[key] ?? '')]);
}
export function normalizeRecentChoices(values) {
  const result = [], seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const entry = cleanSpeechChoice(value); if (!entry) continue;
    const key = speechChoiceKey(entry); if (seen.has(key)) continue;
    result.push(entry); seen.add(key); if (result.length === MAX_RECENT) break;
  }
  return result;
}
export function rememberSpeechChoice(settings, profile) {
  const entry = cleanSpeechChoice(profile); if (!entry) return false;
  const current = normalizeRecentChoices(settings.recent);
  if (current[0] && speechChoiceKey(current[0]) === speechChoiceKey(entry)) return false;
  settings.recent = normalizeRecentChoices([entry, ...current]);
  return true;
}
export function applySpeechChoice(settings, value) {
  const entry = cleanSpeechChoice(value); if (!entry) return false;
  const { id, ...profile } = entry;
  settings.provider = id;
  settings.profiles[id] = profile;
  return true;
}
