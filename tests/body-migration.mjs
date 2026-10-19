/**
 * Lazy body storage integration: metadata/body split, reload, legacy inline
 * migration with rollback, eviction, and reset. Runs against a sandbox DSH
 * home so the real profile data is never touched.
 *
 * Setup: needs a node_modules scaffold with the `@deepseek-ai/dsh-home-paths`
 * peer (from the DSH runtime) beside this package's `lib` and `src`:
 *   mkdir -p /tmp/host-test/node_modules/@deepseek-ai/dsh-home-paths
 *   cp <dsh runtime>/node_modules/@deepseek-ai/dsh-home-paths/{package.json,lib/index.js} /tmp/host-test/node_modules/@deepseek-ai/dsh-home-paths/
 *   DSH_HOME=/tmp/qmr-sandbox/body-migration node tests/body-migration.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { RssStore, dataFilePath } from '../src/host/store.js';

const home = process.env.DSH_HOME;
if (!home) throw new Error('set DSH_HOME to a sandbox directory before running this test');
rmSync(join(home, 'storages', 'qiaomu-rss'), { recursive: true, force: true });

const bodiesPath = join(home, 'storages', 'qiaomu-rss', 'bodies.json');

// ---- split: metadata leaves data.json, bodies move to their own file -------
const store = new RssStore();
store.putArticle({ key: 'qiaomu:1', title: 'One', html: '<p>Body one</p>' });
store.putArticle({ key: 'qiaomu:2', title: 'Two', html: '<p>Body two</p>' });
await store.dispose();

assert.equal(existsSync(bodiesPath), true, 'the body file is written on flush');
const metadata = JSON.parse(readFileSync(dataFilePath(), 'utf8'));
assert.equal(metadata.articles['qiaomu:1'].html, undefined, 'data.json carries no body');
const bodies = JSON.parse(readFileSync(bodiesPath, 'utf8'));
assert.deepEqual(bodies, { 'qiaomu:1': '<p>Body one</p>', 'qiaomu:2': '<p>Body two</p>' });

// ---- reload: a cold store reads bodies on the first article access --------
const reloaded = new RssStore();
await reloaded.load();
assert.equal(existsSync(bodiesPath), true);
const article = await reloaded.getArticle('qiaomu:1');
assert.equal(article.html, '<p>Body one</p>');
assert.equal(article.title, 'One', 'metadata stays with the article');
assert.equal(await reloaded.getArticle('qiaomu:missing'), undefined);
await reloaded.dispose();

// ---- migration: a legacy inline document adopts bodies and rolls back -----
rmSync(bodiesPath, { force: true });
const legacy = {
  version: 1,
  articles: { 'qiaomu:9': { key: 'qiaomu:9', title: 'Nine', fetchedAt: 1, html: '<p>Legacy body</p>' } },
  favorites: {},
  read: {},
  ai: {},
  recent: ['qiaomu:9'],
};
const { mkdirSync, writeFileSync } = await import('node:fs');
mkdirSync(join(home, 'storages', 'qiaomu-rss'), { recursive: true });
writeFileSync(dataFilePath(), JSON.stringify(legacy));

const migrating = new RssStore();
await migrating.load();
assert.equal(existsSync(bodiesPath), false, 'migration waits for the first body read');
const migrated = await migrating.getArticle('qiaomu:9');
assert.equal(migrated.html, '<p>Legacy body</p>');
await migrating.dispose();
assert.equal(existsSync(bodiesPath), true, 'migration writes the body file');
assert.equal(existsSync(`${dataFilePath()}.bak`), true, 'the legacy document is the rollback copy');
assert.equal(JSON.parse(readFileSync(dataFilePath(), 'utf8')).articles['qiaomu:9'].html, undefined, 'the migrated document drops inline bodies');
assert.deepEqual(JSON.parse(readFileSync(bodiesPath, 'utf8')), { 'qiaomu:9': '<p>Legacy body</p>' });

// ---- eviction: metadata and bodies leave together; pins stay --------------
const evicting = new RssStore();
await evicting.load();
for (let index = 0; index < 305; index += 1) {
  evicting.putArticle({ key: `feed:${index}`, title: `Article ${index}`, html: `<p>Body ${index}</p>` });
}
evicting.setFavorite('feed:304', true);
await evicting.dispose();
const afterEviction = JSON.parse(readFileSync(dataFilePath(), 'utf8'));
assert.ok(Object.keys(afterEviction.articles).length <= 301, 'the metadata cap holds with the favorite pinned');
const afterBodies = JSON.parse(readFileSync(bodiesPath, 'utf8'));
assert.equal(afterBodies['feed:304'], '<p>Body 304</p>', 'a pinned favorite keeps its body');
assert.ok(Object.keys(afterBodies).length <= Object.keys(afterEviction.articles).length, 'bodies never outlive metadata');

// ---- reset: the body file is gone and metadata is back to defaults ---------
await evicting.reset();
assert.equal(existsSync(bodiesPath), false, 'reset removes the body file');
assert.deepEqual(Object.keys(JSON.parse(readFileSync(dataFilePath(), 'utf8')).articles), [], 'reset restores default metadata');

console.log('Body store integration: split, reload, migration, eviction and reset passed');
