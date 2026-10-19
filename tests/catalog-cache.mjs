/**
 * Source-catalog cache (ported from the Obsidian plugin 0.27.2): repeat reads
 * inside the 60-second TTL share one fetch, `force` bypasses it, and a failed
 * fetch leaves nothing cached so the next call retries.
 */
import assert from 'node:assert/strict';
import { fetchSources } from '../src/host/qiaomu.js';

const origin = 'https://example.test';
let fetches = 0;
let failNext = false;
globalThis.fetch = async (url) => {
  assert.match(String(url), /\/api\/sources$/);
  fetches += 1;
  if (failNext) return new Response('nope', { status: 500 });
  return new Response(JSON.stringify({ sources: [
    { id: 'a', name: 'Channel A', enabled: true },
    { id: 'b', name: 'Channel B', enabled: false, category: 'community' },
  ] }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const first = await fetchSources(origin);
assert.equal(fetches, 1);
assert.deepEqual(first, [
  { id: 'a', name: 'Channel A', enabled: true },
  { id: 'b', name: 'Channel B', enabled: false, category: 'community' },
]);

// A second read inside the TTL shares the cached catalog.
const second = await fetchSources(`${origin}/`);
assert.equal(fetches, 1);
assert.deepEqual(second, first);

// An explicit refresh bypasses the cache.
await fetchSources(origin, { force: true });
assert.equal(fetches, 2);

// A failed read caches nothing and stays retryable.
failNext = true;
await assert.rejects(fetchSources('https://other.test'), /HTTP 500/);
failNext = false;
await fetchSources('https://other.test');
assert.equal(fetches, 4, 'each distinct origin keeps its own cache entry');

// A different origin does not share the first origin's catalog.
await fetchSources(origin);
assert.equal(fetches, 4);

console.log('Source catalog: TTL sharing, force bypass, per-origin scope and retryable failures passed');
