// Where people can follow the author: the rows on the video end card. Pure data, no DOM.
export const PLATFORMS = {
  x: { glyph: 'X', color: '#111827' },
  github: { glyph: 'GH', color: '#24292f' },
  wechat: { glyph: '公', color: '#07c160' },
  xiaohongshu: { glyph: '书', color: '#ff2442' },
  douyin: { glyph: '抖', color: '#161823' },
  bilibili: { glyph: 'B', color: '#00a1d6' },
  youtube: { glyph: '▶', color: '#e11d48' },
  website: { glyph: 'W', color: '#2563eb' },
  custom: { glyph: '#', color: '#475569' },
};
export const MAX_ACCOUNTS = 6;

// Saved accounts → end card rows. `label(kind)` supplies the visible platform name.
export function outroAccounts(accounts, label) {
  return (Array.isArray(accounts) ? accounts : []).filter(a => a?.handle?.trim()).slice(0, MAX_ACCOUNTS).map(a => {
    const platform = PLATFORMS[a.kind] || PLATFORMS.custom;
    return { glyph: platform.glyph, color: platform.color, label: a.kind === 'custom' ? (a.label || '').trim() || label('custom') : label(a.kind), handle: a.handle.trim() };
  });
}
export function cleanAccounts(value) {
  return (Array.isArray(value) ? value : []).slice(0, MAX_ACCOUNTS).filter(a => a && typeof a === 'object').map(a => ({
    kind: PLATFORMS[a.kind] ? a.kind : 'custom', handle: String(a.handle ?? '').slice(0, 80), label: String(a.label ?? '').slice(0, 20),
  }));
}
