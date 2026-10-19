/**
 * Shared-request coalescing (ported from the Obsidian plugin 0.27.2):
 * identical concurrent calls share one promise, settled promises leave the
 * map so failures and repeated reads stay retryable, and non-function values
 * pass through untouched.
 */
import assert from 'node:assert/strict';
import { shareRequests } from '../src/client/request-cache.js';

let calls = 0;
let failNext = false;
const api = {
  listEntries: async (params) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (failNext) throw new Error('boom');
    return { params, calls };
  },
  ping: 42,
};
const shared = shareRequests(api);

const [first, second, third] = await Promise.all([
  shared.listEntries({ channel: 'qiaomu' }),
  shared.listEntries({ channel: 'qiaomu' }),
  shared.listEntries({ channel: 'qiaomu' }),
]);
assert.equal(calls, 1, 'identical concurrent calls must share one request');
assert.equal(first, second);
assert.equal(second, third);

// A different payload is a different request.
await shared.listEntries({ channel: 'feeds:all' });
assert.equal(calls, 2);

// After settling the shared entry is gone: the next call is a fresh request.
await shared.listEntries({ channel: 'qiaomu' });
assert.equal(calls, 3);

// A rejected shared promise rejects every waiter and leaves nothing cached.
failNext = true;
const results = await Promise.allSettled([
  shared.listEntries({ channel: 'bad' }),
  shared.listEntries({ channel: 'bad' }),
]);
assert.deepEqual(results.map((item) => item.status), ['rejected', 'rejected']);
assert.equal(calls, 4, 'the rejected call was issued exactly once');
failNext = false;
await shared.listEntries({ channel: 'bad' });
assert.equal(calls, 5, 'a failed request stays retryable');

assert.equal(shared.ping, 42, 'non-function values pass through');

// Only the named request methods may be coalesced. A synchronous accessor
// wrapped as a request would return a promise where callers read a value —
// the AI companion's workspace lookup broke exactly this way.
let syncCalls = 0;
const bridge = {
  defaultChatWorkspace() { syncCalls += 1; return 'workspace-1'; },
  watchChatWorkspaces() { return () => {}; },
  listEntries: async () => 'entries',
};
const selective = shareRequests(bridge, new Set(['listEntries']));
assert.equal(selective.defaultChatWorkspace(), 'workspace-1', 'sync accessors must not become promises');
assert.equal(syncCalls, 1);
const unsubscribe = selective.watchChatWorkspaces();
assert.equal(typeof unsubscribe, 'function', 'subscription handles must stay callable');
assert.equal(await selective.listEntries(), 'entries');
assert.equal(bridge.defaultChatWorkspace(), 'workspace-1', 'uncached accessors stay untouched');
console.log('Shared requests: concurrent coalescing, retryable failures, allowlist and sync passthrough passed');
