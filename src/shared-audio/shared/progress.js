// Two independent hashes plus length identify the exact spoken body; no article text is persisted.
export function speechFingerprint(text) {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b, 33) ^ c; }
  return `${text.length}-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}
export function rememberProgress(record, key, fingerprint, offset, ended = false) {
  record[key] = { fingerprint, offset: Math.max(0, offset), ended, at: Date.now() };
  const keys = Object.keys(record).sort((a, b) => (record[b]?.at || 0) - (record[a]?.at || 0));
  for (const old of keys.slice(500)) delete record[old];
}
export function resumeOffset(record, key, fingerprint) {
  const saved = record[key];
  return saved?.fingerprint === fingerprint && !saved.ended && Number.isSafeInteger(saved.offset) && saved.offset >= 0 ? saved.offset : 0;
}
