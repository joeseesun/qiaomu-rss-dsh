/** Home reads cached metadata only. No fetch, body load, mutation or credential access. */
export function rssHomeSnapshot(data) {
  const entries = new Map();
  const sources = new Map((data.qiaomuSources?.sources || []).map(source => [source.id, source]));
  const add = (entry, sourceName) => {
    if (!entry?.key || entries.has(entry.key)) return;
    const source = sources.get(entry.channelKey?.replace(/^qiaomu:/, ''));
    if (source?.enabled === false) return;
    entries.set(entry.key, {
      id: entry.key, title: entry.title || '', titleZh: entry.titleZh,
      sourceName: sourceName || entry.channelName || source?.name || '',
      published: entry.publishedAt, image: entry.image,
      audio: entry.audioUrl ? {url: entry.audioUrl} : undefined,
    });
  };
  for (const entry of data.qiaomuStream?.entries || []) add(entry);
  for (const source of Object.values(data.qiaomuChannels || {})) for (const entry of source.entries || []) add(entry);
  for (const sub of data.subscriptions || []) for (const entry of sub.entries || []) add(entry, sub.name);
  for (const entry of data.podcastEntries || []) add(entry);
  // Favorites may outlive their source feed/cache; metadata remains searchable.
  for (const key of Object.keys(data.favorites || {})) add(data.articles?.[key]);
  const sorted = [...entries.values()].sort((a,b)=>(Date.parse(b.published)||0)-(Date.parse(a.published)||0));
  return {entries: sorted, readIds: Object.keys(data.read || {}), favoriteIds: Object.keys(data.favorites || {})};
}
