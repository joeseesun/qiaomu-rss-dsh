/** FreshRSS (Google Reader compatible) import tests. Run: node tests/freshrss.mjs */
import assert from 'node:assert';
import { createServer } from 'node:http';
import { apiRootOf, listFreshRssSubscriptions } from '../src/host/freshrss.js';
import { parseOpml } from '../src/host/feeds.js';

// --- apiRootOf normalization -------------------------------------------------

assert.equal(apiRootOf('https://rss.example.org'), 'https://rss.example.org');
assert.equal(apiRootOf('https://rss.example.org/'), 'https://rss.example.org');
assert.equal(apiRootOf('https://rss.example.org/rss/'), 'https://rss.example.org');
assert.equal(apiRootOf('https://rss.example.org/api/greader.php'), 'https://rss.example.org');
assert.throws(() => apiRootOf('ftp://rss.example.org'), /http\(s\)/);
assert.throws(() => apiRootOf('https://user:pass@rss.example.org'), /用户名或密码/);
assert.throws(() => apiRootOf('not a url'), /合法 URL/);
console.log('apiRootOf OK');

// --- listFreshRssSubscriptions against a fake GReader server -----------------

const SUBSCRIPTIONS_JSON = JSON.stringify({
  subscriptions: [
    { id: 'feed/1', title: 'Hacker News', url: 'https://news.ycombinator.com/rss', categories: [{ id: 'user/-/label/Tech', label: 'Tech' }] },
    { id: 'feed/2', title: '  ', url: 'https://blog.example.org/feed.xml', categories: [] },
    { id: 'feed/3', title: 'Podcast', url: 'https://podcast.example.org/rss', categories: [{ id: 'user/-/label/Audio', label: 'Audio' }, { id: 'user/-/label/EN', label: 'EN' }] },
    { id: 'feed/4', title: 'Broken', url: 'javascript:alert(1)', categories: [] },
  ],
});

let seenAuth = '';
const server = createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/api/greader.php/accounts/ClientLogin') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const params = new URLSearchParams(body);
      if (params.get('Email') === 'alice' && params.get('Passwd') === 'app-password') {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('SID=sid\nLSID=lsid\nAuth=SECRET_TOKEN\n');
      } else {
        response.writeHead(401, { 'Content-Type': 'text/plain' });
        response.end('Error=BadAuthentication');
      }
    });
    return;
  }
  if (request.url.startsWith('/api/greader.php/reader/api/0/subscription/list')) {
    if (request.headers.authorization !== 'GoogleLogin auth=SECRET_TOKEN') {
      response.writeHead(401); response.end('unauthorized'); return;
    }
    seenAuth = request.headers.authorization;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(SUBSCRIPTIONS_JSON);
    return;
  }
  response.writeHead(404); response.end('not found');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// Wrong password surfaces a friendly error.
await assert.rejects(
  () => listFreshRssSubscriptions({ server: base, username: 'alice', password: 'wrong' }),
  /用户名或应用密码错误/,
);

// Successful login + list, with URL normalization and filtering.
const subs = await listFreshRssSubscriptions({ server: `${base}/`, username: 'alice', password: 'app-password' });
assert.equal(seenAuth, 'GoogleLogin auth=SECRET_TOKEN');
assert.equal(subs.length, 3); // javascript: URL filtered out
assert.deepEqual(subs[0], { url: 'https://news.ycombinator.com/rss', name: 'Hacker News', group: 'Tech' });
assert.equal(subs[1].name, 'https://blog.example.org/feed.xml'); // blank title falls back to URL
assert.equal(subs[1].group, undefined);
assert.equal(subs[2].group, 'Audio / EN');

// Missing inputs fail fast before any network call.
await assert.rejects(() => listFreshRssSubscriptions({ server: base, username: '', password: 'x' }), /用户名/);
await assert.rejects(() => listFreshRssSubscriptions({ server: base, username: 'alice', password: '' }), /密码/);

server.close();

// --- The generated OPML is round-trippable through the existing pipeline -----

const { buildOpml } = await import('../src/host/feeds.js');
const xml = buildOpml(subs.map((sub) => ({ url: sub.url, name: sub.name, group: sub.group })));
const entries = parseOpml(xml);
assert.equal(entries.length, 3);
assert.equal(entries[0].name, 'Hacker News');
assert.equal(entries[0].group, 'Tech');
assert.equal(entries[2].group, 'Audio / EN');
console.log('freshrss list + opml round-trip OK');
