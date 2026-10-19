/**
 * Variable-height list window, ported from the Obsidian plugin's
 * `src/list-window.ts` (0.29.0). A Fenwick tree keeps prefix sums so far
 * scrolling and `offset()` stay independent of the article count; measured
 * row heights replace the initial estimate so scroll anchors stay stable.
 */
export class ListWindow {
  constructor(estimate = 130) {
    this.estimate = estimate;
    this.ids = [];
    this.positions = new Map();
    this.sizes = new Map();
    this.tree = new Float64Array(1);
    this.heights = [];
  }

  setItems(ids) {
    if (ids.length === this.ids.length && ids.every((id, index) => id === this.ids[index])) return;
    this.ids = ids;
    this.positions = new Map(ids.map((id, index) => [id, index]));
    this.sizes = new Map([...this.sizes].filter(([id]) => this.positions.has(id)));
    this.tree = new Float64Array(ids.length + 1);
    this.heights = ids.map((id) => this.sizes.get(id) || this.estimate);
    for (let i = 1; i < this.tree.length; i++) {
      this.tree[i] += this.heights[i - 1];
      const parent = i + (i & -i);
      if (parent < this.tree.length) this.tree[parent] += this.tree[i];
    }
  }

  /** Apply a measured height delta to every enclosing prefix sum. */
  add(index, delta) {
    for (let i = index + 1; i < this.tree.length; i += i & -i) this.tree[i] += delta;
  }

  /** Pixel offset of one row index. */
  offset(index) {
    let value = 0;
    for (let i = Math.min(index, this.ids.length); i > 0; i -= i & -i) value += this.tree[i];
    return value;
  }

  get total() {
    return this.offset(this.ids.length);
  }

  /** Row index whose bottom edge first passes `top`. */
  indexAt(top) {
    let lo = 0;
    let hi = this.ids.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.offset(mid + 1) <= top) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(lo, Math.max(0, this.ids.length - 1));
  }

  idAt(index) {
    return this.ids[index];
  }

  position(id) {
    return this.positions.get(id);
  }

  /** Record one rendered row height; returns whether anything changed. */
  measure(id, height) {
    const index = this.positions.get(id);
    if (index === undefined || height <= 0 || Math.abs(this.heights[index] - height) < 0.5) return false;
    this.add(index, height - this.heights[index]);
    this.heights[index] = height;
    this.sizes.set(id, height);
    return true;
  }

  /** Rows to render for one viewport, with the spacer heights around them. */
  range(top, viewport) {
    const start = Math.max(0, this.indexAt(Math.max(0, top)) - 6);
    const end = Math.min(this.ids.length, Math.max(start + 1, this.indexAt(top + viewport) + 7));
    return { start, end, before: this.offset(start), after: this.total - this.offset(end) };
  }

  clearMeasurements() {
    const ids = this.ids;
    this.ids = [];
    this.sizes.clear();
    this.setItems(ids);
  }
}
