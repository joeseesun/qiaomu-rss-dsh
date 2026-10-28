import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mergeReadingVersion } from '../src/client/reading-version.js';

// Exercise the real Host operations with only the framework registration stubbed.
const built = await build({ entryPoints: ['src/host/service.js'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{
  name: 'framework-only', setup(builder) {
    builder.onResolve({ filter: /^@deepseek-ai\// }, args => ({ path: args.path, namespace: 'framework' }));
    builder.onLoad({ filter: /.*/, namespace: 'framework' }, () => ({ contents: `export class TypertRemoteService {};
      export const Remote = () => () => {}; export const resolveDshHome = () => '/tmp/unused-qrs-test';
      export const defineTool = x => x; export const createSystemMessage = x => x; export const createUserMessage = x => x;` }));
  },
}] });
const { RssService } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const service = Object.create(RssService.prototype);
const article = { key: 'qiaomu:test', title: 'Test', html: '<p>Readable original</p>' };
service.ready = Promise.resolve();
service.store = { data: { settings: {}, ai: {} }, putArticle() {}, putAiVersion(key, kind, value) { (this.data.ai[key] ??= {})[kind] = value; } };
service.ensureArticle = async () => article;
service.entrySummary = value => value;
service.videoPlayer = { url: async () => undefined };
let fetches = 0, releaseTranslation;
globalThis.fetch = async url => {
  fetches++;
  if (String(url).endsWith('/translation')) return new Promise(resolve => { releaseTranslation = resolve; });
  return Response.json({ rewrite: { title: 'Rewrite', body: 'Readable rewrite' } });
};
const original = await service.getArticle({ key: article.key, cachedVersions: true });
assert.equal(fetches, 0, 'opening a cached body never waits on published versions');
assert.equal(original.html, article.html);
const translation = service.getArticleVersions({ key: article.key, kind: 'translation' });
const rewrite = await service.getArticleVersions({ key: article.key, kind: 'rewrite' });
assert.equal(rewrite.markdown, 'Readable rewrite', 'a hung translation does not block the rewrite');
releaseTranslation(Response.json({ translation: { content: [{ target: 'Translation' }] } }));
assert.equal((await translation).markdown, 'Translation');
const state = { ...original, active: 'original', requestedVersion: 'rewrite' };
assert.equal(mergeReadingVersion(state, article.key, 'rewrite', rewrite).active, 'rewrite');
assert.equal(mergeReadingVersion({ ...state, requestedVersion: 'original' }, article.key, 'rewrite', rewrite).active, 'original');
assert.equal(mergeReadingVersion(state, 'qiaomu:other', 'rewrite', rewrite), state, 'stale article response is ignored');
const generated = { ...state, versions: { rewrite: { available: true, markdown: 'New generated version' } } };
assert.equal(mergeReadingVersion(generated, article.key, 'rewrite', rewrite), generated, 'late reads cannot replace newly generated text');
console.log('progressive reading: cached body, independent versions, preference, manual choice, stale response and generation race');
