// Visual styles for the band between the title and the subtitles. To add one: write a draw(ctx, scene, t)
// function, say in `needs` which audio features it reads (see analysis.js), and register it below. The
// share dialog lists every registered style; its label comes from the `share.visual.<id>` string.
import { COLORS, FPS, circleImage, clamp, rounded } from './draw.js';

const frameOf = (scene, t, length) => clamp(Math.round(t * FPS), 0, Math.max(0, length - 1));
// Loudness 0..1 at time t.
export function levelAt(scene, t) { const { envelope } = scene.features; return envelope?.length ? envelope[frameOf(scene, t, envelope.length)] : 0; }
// Band levels (low → high frequency, 0..1) at time t; all zeros when the style did not request `spectrum`.
export function bandsAt(scene, t) {
  const { bands, spectrum } = scene.features;
  if (!bands || !spectrum) return new Float32Array(48);
  const frames = spectrum.length / bands, frame = frameOf(scene, t, frames);
  return spectrum.subarray(frame * bands, (frame + 1) * bands);
}

const STOPS = [[125, 211, 252], [167, 139, 250], [240, 171, 252]];
// Cool-to-warm colour along 0..1, shared by the styles so they read as one family.
export function ramp(k) {
  const x = clamp(k) * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(x)), f = x - i;
  return `rgb(${STOPS[i].map((v, c) => Math.round(v + (STOPS[i + 1][c] - v) * f)).join(',')})`;
}
function rampGradient(ctx, x0, x1) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  STOPS.forEach((_, i) => g.addColorStop(i / (STOPS.length - 1), ramp(i / (STOPS.length - 1))));
  return g;
}

// Loudness bars sliding past a centre playhead: what was said is bright, what is coming is dim.
function drawBars(ctx, scene, t) {
  const { envelope } = scene.features, a = scene.area, pitch = scene.portrait ? 20 : 22, bars = Math.floor(a.width / pitch), center = (bars - 1) / 2, x0 = a.cx - (bars * pitch) / 2;
  for (let i = 0; i < bars; i++) {
    const at = Math.round((t + (i - center) * 0.045) * FPS), level = at >= 0 && at < envelope.length ? envelope[at] : 0;
    const taper = 0.35 + 0.65 * Math.cos(((i - center) / (center + 1)) * Math.PI / 2), h = Math.max(8, level * a.height * taper + 8);
    ctx.fillStyle = i <= center ? COLORS.accent : 'rgba(248,250,252,0.26)';
    rounded(ctx, x0 + i * pitch, a.cy - h / 2, pitch * 0.58, h, pitch * 0.29); ctx.fill();
  }
}

// The actual samples of the audio around now, one thin line per column: what you see is what you hear.
function drawWave(ctx, scene, t) {
  const { pcm, rate, peak } = scene.features, a = scene.area; if (!pcm) return;
  const columns = Math.floor(a.width / 5), span = 0.16, perColumn = Math.max(1, Math.round(span * rate / columns)), x0 = a.cx - (columns * 5) / 2, start = t - span / 2;
  for (let i = 0; i < columns; i++) {
    const from = Math.round((start + (i / columns) * span) * rate); let low = 0, high = 0;
    for (let k = Math.max(0, from); k < Math.min(pcm.length, from + perColumn); k++) { const v = pcm[k]; if (v < low) low = v; if (v > high) high = v; }
    const taper = Math.sin(Math.PI * (i + 0.5) / columns) ** 0.6, top = clamp(high / peak, 0, 1) * taper, bottom = clamp(-low / peak, 0, 1) * taper;
    const y0 = a.cy - top * a.height / 2, y1 = a.cy + bottom * a.height / 2;
    ctx.fillStyle = i < columns / 2 ? COLORS.accent : 'rgba(248,250,252,0.34)';
    rounded(ctx, x0 + i * 5, y0 - 1.5, 3, Math.max(3, y1 - y0 + 3), 1.5); ctx.fill();
  }
  ctx.fillStyle = 'rgba(248,250,252,0.16)'; ctx.fillRect(x0, a.cy - 1, columns * 5, 2);
}

// Equaliser: 48 frequency bands from bass to treble, mirrored around the centre line.
function drawSpectrum(ctx, scene, t) {
  const a = scene.area, bands = bandsAt(scene, t), pitch = a.width / bands.length, x0 = a.cx - a.width / 2;
  ctx.fillStyle = rampGradient(ctx, x0, x0 + a.width);
  for (let i = 0; i < bands.length; i++) {
    const h = Math.max(8, bands[i] * a.height * 1.05);
    rounded(ctx, x0 + i * pitch + pitch * 0.19, a.cy - h / 2, pitch * 0.62, h, pitch * 0.31); ctx.fill();
  }
}

// Spectrum wrapped around the avatar (or the author's initial): bass at the bottom, treble at the top.
function drawRing(ctx, scene, t) {
  const a = scene.area, bands = bandsAt(scene, t), level = levelAt(scene, t), r0 = scene.portrait ? 165 : 115, reach = scene.portrait ? 165 : 100, count = 72, thick = scene.portrait ? 9 : 7;
  ctx.lineCap = 'round'; ctx.lineWidth = thick;
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count, m = Math.abs(2 * u - 1), band = Math.round((1 - m) * (bands.length - 1)), angle = Math.PI / 2 + u * Math.PI * 2;
    const from = r0 + 14, to = from + 6 + bands[band] * reach, cos = Math.cos(angle), sin = Math.sin(angle);
    ctx.strokeStyle = ramp(1 - m); ctx.beginPath(); ctx.moveTo(a.cx + cos * from, a.cy + sin * from); ctx.lineTo(a.cx + cos * to, a.cy + sin * to); ctx.stroke();
  }
  ctx.strokeStyle = `rgba(125,211,252,${0.3 + 0.4 * level})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(a.cx, a.cy, r0 + 4 + level * 6, 0, Math.PI * 2); ctx.stroke();
  const inner = r0 - 8;
  if (scene.avatar) circleImage(ctx, scene.avatar, a.cx, a.cy, inner);
  else {
    ctx.fillStyle = '#1b2440'; ctx.beginPath(); ctx.arc(a.cx, a.cy, inner, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.accent; ctx.font = `700 ${inner}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText([...(scene.byline || scene.title || '·')][0], a.cx, a.cy + inner * 0.06);
  }
}

export const VISUAL_STYLES = {
  spectrum: { id: 'spectrum', needs: ['spectrum'], draw: drawSpectrum },
  ring: { id: 'ring', needs: ['spectrum'], draw: drawRing },
  wave: { id: 'wave', needs: ['pcm'], draw: drawWave },
  bars: { id: 'bars', needs: [], draw: drawBars },
};
export const DEFAULT_STYLE = 'spectrum';
export const STYLE_IDS = Object.keys(VISUAL_STYLES);
export const styleNeeds = id => (VISUAL_STYLES[id] || VISUAL_STYLES[DEFAULT_STYLE]).needs;
