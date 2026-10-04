export function youtubeEmbedUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    let id;
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else {
        const match = /^\/(?:embed|shorts|live)\/([^/]+)\/?$/.exec(url.pathname);
        id = match?.[1];
      }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id ?? '') ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch { return null; }
}

// Bilibili's own embed. Its page number is kept; tracking parameters in the link are not passed on.
export function bilibiliEmbedUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(url.hostname.toLowerCase())) return null;
    const bvid = /^\/video\/(BV[0-9A-Za-z]{10})\/?$/.exec(url.pathname)?.[1];
    if (!bvid) return null;
    const part = parseInt(url.searchParams.get('p') || '1', 10);
    return `https://player.bilibili.com/player.html?isOutside=true&bvid=${bvid}&p=${part > 0 ? part : 1}&autoplay=0&high_quality=1&danmaku=0`;
  } catch { return null; }
}

export function articleVideoEmbed(article) {
  return youtubeEmbedUrl(article?.videoUrl) ?? youtubeEmbedUrl(article?.url) ?? bilibiliEmbedUrl(article?.videoUrl) ?? bilibiliEmbedUrl(article?.url);
}

export const isBilibiliEmbed = (embed) => typeof embed === 'string' && embed.startsWith('https://player.bilibili.com/');

export function articleAudioUrl(article) {
  const value = typeof article?.audio === 'string' ? article.audio : article?.audio?.url;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const type = article?.audio?.type?.toLowerCase();
    return !type || type.startsWith('audio/') ? url.href : null;
  } catch { return null; }
}
