/**
 * Lazy article-body storage, adapted from the Obsidian plugin's BodyStore
 * (0.29.0). Article bodies live in their own `bodies.json` beside `data.json`
 * and load on the first body read instead of at startup; metadata saves never
 * rewrite the body file. Bodies are evicted together with their metadata and
 * capped, with the same pinned protection as article metadata (favorites,
 * recent reads, annotations). A legacy document that still carries inline
 * bodies migrates once, keeping a rollback copy of `data.json`.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class BodyStore {
  constructor(path, maxBodies = 300) {
    this.path = path;
    this.maxBodies = maxBodies;
    this.bodies = new Map();
    this.loaded = false;
    this.loading = undefined;
    this.dirty = false;
    this.saveTimer = undefined;
    this.saving = Promise.resolve();
    this.lastPrune = undefined;
  }

  /** Load bodies on demand; the first body read pays the file cost, boot does not. */
  async load() {
    if (this.loaded) return this.bodies;
    if (this.loading === undefined) {
      this.loading = readFile(this.path, 'utf8')
        .then((raw) => {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            for (const [key, value] of Object.entries(parsed)) {
              if (typeof value === 'string') this.bodies.set(key, value);
            }
          }
          this.loaded = true;
          // A prune that ran while the file was still loading must be applied
          // again, otherwise the merged file contents would resurrect evicted
          // bodies the caller already decided to drop.
          if (this.lastPrune !== undefined) this.prune(this.lastPrune.metadataKeys, this.lastPrune.pinned);
          return this.bodies;
        })
        .catch((error) => {
          if (error?.code !== 'ENOENT') {
            throw new Error('qiaomu-rss: cannot read saved bodies; refusing to overwrite them', { cause: error });
          }
          this.loaded = true;
          return this.bodies;
        })
        .finally(() => { this.loading = undefined; });
    }
    return this.loading;
  }

  /** Adopt bodies extracted from a legacy inline document (migration). */
  adopt(entries) {
    for (const [key, html] of entries) {
      if (typeof html === 'string' && html !== '') this.bodies.set(key, html);
    }
    // The adopted set is authoritative; no older file should be re-read.
    this.loaded = true;
    this.dirty = true;
  }

  set(key, html) {
    if (typeof html !== 'string' || html === '') {
      this.delete([key]);
      return;
    }
    // A write before the first read must still merge with whatever the file
    // already holds, so start the one-time load here.
    if (!this.loaded && this.loading === undefined) void this.load().catch(() => {});
    this.bodies.set(key, html);
    this.dirty = true;
  }

  delete(keys) {
    let changed = false;
    for (const key of keys) {
      if (this.bodies.delete(key)) changed = true;
    }
    if (changed) this.dirty = true;
  }

  /**
   * Drop bodies whose metadata is gone, then cap the remaining evictable
   * bodies. Pinning only protects against the cap, never against metadata
   * loss: an evicted article's body goes with it.
   */
  prune(metadataKeys, pinned) {
    this.lastPrune = { metadataKeys, pinned };
    const kept = metadataKeys instanceof Set ? metadataKeys : new Set(metadataKeys);
    for (const key of [...this.bodies.keys()]) {
      if (!kept.has(key)) this.bodies.delete(key);
    }
    const evictable = [...this.bodies.keys()].filter((key) => !pinned.has(key));
    if (evictable.length > this.maxBodies) {
      for (const key of evictable.slice(0, evictable.length - this.maxBodies)) this.bodies.delete(key);
    }
    this.dirty = true;
  }

  /** Schedule a debounced body-file save (500 ms), independent of metadata. */
  touch() {
    if (this.saveTimer !== undefined) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      void this.flush().catch(() => {});
    }, 500);
  }

  /** Write the body file through a temp file + rename, serialized. */
  async flush() {
    if (!this.dirty) return;
    // A pending first read must settle before writing, so an unloaded store
    // never clobbers bodies it has not read yet.
    if (this.loading !== undefined) await this.loading;
    this.dirty = false;
    this.saving = this.saving.catch(() => {}).then(async () => {
      try {
        await mkdir(dirname(this.path), { recursive: true });
        const temp = `${this.path}.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify(Object.fromEntries(this.bodies)), { encoding: 'utf8', mode: 0o600 });
        await rename(temp, this.path);
      } catch (error) {
        this.dirty = true;
        throw error;
      }
    });
    return this.saving;
  }

  async dispose() {
    if (this.saveTimer !== undefined) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    await this.flush();
  }

  /** Forget every body and remove the file (reset-to-factory path). */
  async destroy() {
    this.bodies.clear();
    this.loaded = true;
    this.dirty = false;
    await rm(this.path, { force: true });
  }
}
