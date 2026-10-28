const ORDER = ['original', 'translation', 'rewrite'];

/** Apply the reader preference only when that article actually has content. */
export function resolveReadingVersion(preferred, article) {
  const readable = (kind) => kind === 'original'
    ? Boolean(article?.html?.trim())
    : article?.versions?.[kind]?.available === true && Boolean(article.versions[kind].markdown?.trim());
  const candidates = [preferred, ...ORDER.filter(kind => kind !== preferred && kind !== 'original'), 'original'];
  return candidates.find(kind => ORDER.includes(kind) && readable(kind)) ?? 'original';
}

export function mergeReadingVersion(current, key, kind, version) {
  if (current?.article?.key !== key || current.generating === kind || current.versions?.[kind]?.available) return current;
  const next = { ...current, versions: { ...current.versions, [kind]: version } };
  return { ...next, active: resolveReadingVersion(current.requestedVersion, next) };
}
