// Shared constants and small canvas helpers for the share video. Pure: no DOM or Obsidian imports.
export const FPS = 30;
export const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",system-ui,-apple-system,"Segoe UI",sans-serif';
export const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,"PingFang SC",monospace';
export const COLORS = { bgTop: '#0a0f1f', bgBottom: '#141c36', accent: '#7dd3fc', violet: '#a78bfa', pink: '#f0abfc', strong: '#fbbf24', text: '#f8fafc', terminal: '#0d1117', line: 'rgba(255,255,255,0.14)' };

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const ease = x => 1 - (1 - clamp(x)) ** 3;
export const back = x => { const c = 1.70158, p = clamp(x) - 1; return 1 + (c + 1) * p ** 3 + c * p ** 2; };

export function rounded(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius); ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius); ctx.arcTo(x, y, x + w, y, radius); ctx.closePath();
}
// Square-cropped image drawn into a circle of radius r around (cx, cy).
export function circleImage(ctx, image, cx, cy, r) {
  const w = image.width || image.naturalWidth, h = image.height || image.naturalHeight, side = Math.min(w, h);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(image, (w - side) / 2, (h - side) / 2, side, side, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}
