import assert from 'node:assert/strict';
import { fetchEntry } from '../src/host/qiaomu.js';

const calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (new URL(url).hostname === 'rss.qiaomu.ai') throw new TypeError('fetch failed');
  return Response.json({ entry: { id: 'recovered', content: '<p>Recovered</p>' } });
};
assert.equal((await fetchEntry('https://rss.qiaomu.ai', 'recovered')).id, 'recovered');
assert.deepEqual(calls.map(url => new URL(url).hostname), ['rss.qiaomu.ai', 'rss-edge.qiaomu.ai']);
calls.length = 0;
await fetchEntry('https://rss.qiaomu.ai', 'next');
assert.equal(new URL(calls[0]).hostname, 'rss-edge.qiaomu.ai', 'reuse a recently working route');
calls.length = 0;
globalThis.fetch = async url => { calls.push(String(url)); return Response.json({ error: 'hidden' }, { status: 404 }); };
await assert.rejects(fetchEntry('https://rss.qiaomu.ai', 'hidden'), /HTTP 404/);
assert.equal(calls.length, 1, 'never recover a hidden article through another route');
calls.length = 0;
globalThis.fetch = async url => { calls.push(String(url)); throw new TypeError('offline'); };
await assert.rejects(fetchEntry('https://private.example', 'private'));
assert.ok(calls.every(url => new URL(url).hostname === 'private.example'));
console.log('network recovery: alternate route, route memory, authoritative 404, custom service isolation');
