// Word timing for read-along highlighting. A mark is { s, e, from, to }:
// characters [s, e) of the synthesized text spoken during [from, to) seconds.
// Providers that report real timestamps are aligned onto the request text;
// everything else gets an estimate spread over the measured audio duration.

const PAUSE = /[，、；;,:：]/u, STOP = /[。！？.!?…\n]/u, CLOSE = /["'”’）)」』】》]/u;

// Align provider words (which may carry trailing punctuation) with the text we
// sent. Unmatched words are skipped rather than letting the cursor drift.
export function alignWords(text, words, cursor = 0) {
  const marks = [];
  for (const entry of words || []) {
    const word = String(entry?.word ?? '').replace(/\s+/g, '');
    const from = Number(entry?.startTime), to = Number(entry?.endTime);
    if (!word || !Number.isFinite(from) || !Number.isFinite(to) || to < from) continue;
    let at = text.indexOf(word, cursor);
    if (at < 0 || at - cursor > 16) {
      const bare = word.replace(/[\p{P}\p{S}]+$/u, '');
      at = bare && bare !== word ? text.indexOf(bare, cursor) : -1;
      if (at < 0 || at - cursor > 16) continue;
      marks.push({ s: at, e: at + bare.length, from, to }); cursor = at + bare.length; continue;
    }
    marks.push({ s: at, e: at + word.length, from, to }); cursor = at + word.length;
  }
  return { marks, cursor };
}

function tokens(text) {
  const out = [], re = /[㐀-鿿぀-ヿ가-힯]|[\p{L}\p{N}'’_-]+|[^\s]/gu;
  let match;
  while ((match = re.exec(text))) {
    const value = match[0], s = match.index, e = s + value.length;
    const last = out.at(-1);
    if (/^[\p{P}\p{S}]$/u.test(value) && last) {
      // Punctuation belongs to the preceding word and adds a pause to it.
      last.e = e; last.weight += STOP.test(value) ? 2.2 : PAUSE.test(value) ? 1.2 : CLOSE.test(value) ? 0 : 0.4; continue;
    }
    const cjk = /^[㐀-鿿぀-ヿ가-힯]$/u.test(value);
    out.push({ s, e, weight: cjk ? 1 : 1.3 + 0.18 * value.length });
  }
  return out;
}

// Spread [start, start + duration] across words by weight. Good to within a
// word or two for ordinary prose; used whenever no real timestamps exist.
export function estimateMarks(text, duration, start = 0) {
  if (!(duration > 0)) return [];
  const list = tokens(text), total = list.reduce((sum, x) => sum + x.weight, 0);
  if (!total) return [];
  let at = start;
  return list.map(x => { const from = at; at += duration * x.weight / total; return { s: x.s, e: x.e, from, to: at }; });
}

// Index of the word being spoken at time t, -1 before the first word.
export function markIndex(marks, t) {
  let low = 0, high = marks.length - 1, found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (marks[mid].from <= t) { found = mid; low = mid + 1; } else high = mid - 1;
  }
  return found;
}

// First and last audible sample of 16-bit mono PCM, for trimming estimates.
export function activeRange(samples, rate, threshold = 0.012) {
  const limit = threshold * 32768; let first = -1, last = -1;
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > limit) { if (first < 0) first = i; last = i; }
  return first < 0 ? null : { from: first / rate, to: (last + 1) / rate };
}
