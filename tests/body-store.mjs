/**
 * Lazy body storage (adapted from the Obsidian plugin 0.29.0): bodies live in
 * their own file, load on the first read, survive independent metadata saves,
 * and eviction respects pinned articles.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BodyStore } from '../src/host/body-store.js';

const dir = mkdtempSync(join(tmpdir(), 'qmr-bodies-'));
const path = join(dir, 'bodies.json');

const store = new BodyStore(path, 300);
await store.load();
assert.equal(existsSync(path), false, 'a load with no file must not create one');

store.set('qiaomu:1', '<p>First body</p>');
store.set('qiaomu:2', '<p>Second body</p>');
await store.flush();
assert.ok(existsSync(path), 'the flush writes the body file');

// A second instance reads what the first wrote (lazy load on first use).
const reloaded = new BodyStore(path, 300);
assert.deepEqual(await reloaded.load(), new Map([['qiaomu:1', '<p>First body</p>'], ['qiaomu:2', '<p>Second body</p>']]));

// Unloaded bodies survive a save that never touches them; an empty flush is a no-op.
const metadataOnly = new BodyStore(path, 300);
metadataOnly.bodies.set('qiaomu:1', '<p>First body</p>');
metadataOnly.bodies.set('qiaomu:2', '<p>Second body</p>');
metadataOnly.loaded = true;
await metadataOnly.flush();
assert.equal(readFileSync(path, 'utf8'), JSON.stringify({ 'qiaomu:1': '<p>First body</p>', 'qiaomu:2': '<p>Second body</p>' }), 'a clean flush must not rewrite bodies');

// Eviction drops bodies without metadata, keeps pinned ones, and caps the rest.
const capped = new BodyStore(path, 2);
capped.bodies = new Map([
  ['keep', 'pinned body'],
  ['stale-pin', 'orphan of a pinned article'],
  ['a', 'body a'],
  ['b', 'body b'],
  ['c', 'body c'],
  ['gone', 'orphan body'],
]);
capped.loaded = true;
const pinned = new Set(['keep', 'stale-pin']);
capped.prune(new Set(['keep', 'a', 'b', 'c']), pinned);
assert.equal(capped.bodies.has('gone'), false, 'bodies without metadata are dropped');
assert.equal(capped.bodies.has('stale-pin'), false, 'a pin never keeps a body whose metadata is gone');
assert.equal(capped.bodies.has('keep'), true, 'pinned bodies survive');
assert.equal(capped.bodies.size, 3, 'the cap counts only evictable bodies');
assert.equal(capped.bodies.has('a'), false, 'the least recently written evictable body goes first');
await capped.flush();
const onDisk = JSON.parse(readFileSync(path, 'utf8'));
assert.deepEqual(Object.keys(onDisk).sort(), ['b', 'c', 'keep']);

// Destroy forgets everything and removes the file.
await capped.destroy();
assert.equal(existsSync(path), false);

// A legacy migration adopts inline bodies extracted from the metadata document.
const migrated = new BodyStore(join(dir, 'migrated.json'), 300);
migrated.adopt([['qiaomu:9', '<p>legacy body</p>']]);
await migrated.flush();
const migratedBack = new BodyStore(join(dir, 'migrated.json'), 300);
assert.deepEqual(await migratedBack.load(), new Map([['qiaomu:9', '<p>legacy body</p>']]));

console.log('Body store: lazy load, independent saves, pinned eviction, migration and destroy passed');
