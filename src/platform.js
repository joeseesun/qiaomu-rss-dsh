// Where a submitted link comes from, read from its address. Submitters never pick a category.
export const PLATFORMS = [['youtube', 'YouTube'], ['bilibili', 'B 站'], ['wechat', '公众号'], ['web', '文章']];

export function platformOf(link) {
  let host = '';
  try { host = new URL(link || '').hostname.toLowerCase(); } catch { return 'web'; }
  const is = (domain) => host === domain || host.endsWith(`.${domain}`);
  if (is('youtube.com') || is('youtu.be')) return 'youtube';
  if (is('bilibili.com') || is('b23.tv')) return 'bilibili';
  if (host === 'mp.weixin.qq.com') return 'wechat';
  return 'web';
}
