// Keep DOM ranges in original-text offsets; normalizing speech must not shift
// annotations. Chunks are bounded even when a paragraph has no punctuation.
export function splitSpeechText(text, maxLength = 240, clauses = false) {
  const result = []; let start = 0;
  const pieces = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text)].map(x => x.segment)
    : text.match(/[^。！？.!?\n]+[。！？.!?\n]*|[。！？.!?\n]+/gu) || [];
  const sentences = clauses ? pieces.flatMap(piece => piece.match(/[^，,；;]+[，,；;]*|[，,；;]+/gu) || []) : pieces;
  for (const sentence of sentences) {
    let rest = sentence;
    while (rest.length) {
      let length = Math.min(maxLength, rest.length);
      if (length < rest.length && /[\uD800-\uDBFF]/.test(rest[length - 1])) length--;
      const raw = rest.slice(0, length);
      if (raw.trim()) result.push({ text: raw.replace(/\s+/g, ' ').trim(), start, end: start + length });
      start += length; rest = rest.slice(length);
    }
  }
  return result;
}
export function speechDocumentChunks(doc, fromRange = null, limit = 240, clauses = false) {
  const skipped = 'script,style,nav,rt,rp,[hidden],[aria-hidden="true"],svg,math';
  const walker = doc.createTreeWalker(doc.body, 4); const groups = [];
  let node;
  while ((node = walker.nextNode())) {
    if (!node.textContent || node.parentElement?.closest(skipped)) continue;
    const block = node.parentElement?.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote,td,div') || doc.body;
    let group = groups.at(-1);
    if (!group || group.block !== block) { group = { block, text: '', nodes: [] }; groups.push(group); }
    group.nodes.push({ node, start: group.text.length }); group.text += node.textContent;
  }
  const chunks = [];
  for (const group of groups) {
    const point = offset => {
      const entry = group.nodes.find(x => offset < x.start + x.node.textContent.length) || group.nodes.at(-1);
      return [entry.node, offset - entry.start];
    };
    for (const part of splitSpeechText(group.text, limit, clauses)) {
      const range = doc.createRange(); range.setStart(...point(part.start)); range.setEnd(...point(part.end));
      if (fromRange) {
        const relation = range.comparePoint(fromRange.startContainer, fromRange.startOffset);
        if (relation === 1) continue;
        if (relation === 0) range.setStart(fromRange.startContainer, fromRange.startOffset);
      }
      const fragment = range.cloneContents();
      for (const omitted of fragment.querySelectorAll(skipped)) omitted.remove();
      const text = fragment.textContent.replace(/\s+/g, ' ').trim();
      if (text) chunks.push({ text, range });
    }
  }
  return chunks;
}
