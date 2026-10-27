# Third-party sources and notices

- Qiaomu AI RSS: https://github.com/joeseesun/qiaomu-ai-rss, GPL-3.0-only, source 0.32.9 at `d30a42a0865ca8d971af7f0f85f7354aaf314cdb`. Original speech controller/settings, rendered article source/highlighting, outline, media dock, font loader, translations, notes/export/selection/library components and CSS are under `src/original`. Adaptations replace Obsidian host imports and the native speech boundary. Full GPL text is in `LICENSE`.
- Qiaomu Audio: https://github.com/joeseesun/qiaomu-audio-dsh at `adbb060e802a892cc5d3ead46de2391db36e725d`, based on https://github.com/joeseesun/qiaomu-audio at `73bf3c21d9ecbb5c269effdd48e0e754e221679d`, GPL-3.0-only. Transitive shared speech modules under `src/shared-audio` retain the original speech controller, providers, timing, local-model catalogue, choices and settings. Synthesis/catalogue calls use the optional public `qiaomuAudio` service; credential and persistence ownership remains with RSS.
- Qiaomu Audio DSH 0.1.3 (`528efc073911fbdecfb4b126eb161661542ee448`): `src/host/notes-store.js` adapts its scoped Markdown store with an extra pre-commit content check, GPL-3.0-only.
- Qiaomu Reading Fangsong: bundled upstream font under SIL Open Font License 1.1. Full copyright and terms: `licenses/QiaomuReadingFangsong-OFL.txt`.
- Zod: MIT; Lucide and Lucide React: ISC. Full dependency license texts: `licenses/DEPENDENCIES.md`. React is provided by the Harness client.
- Chinese Independent Blogs: retained upstream directory license in `vendor/chinese-independent-blogs/LICENSE`. Catalog data remains attributed to its upstream source; plugin GPL does not relicense external article content.

Full corresponding source and build scripts are distributed through this repository and release source archives. No runtime user settings, credentials or cached article bodies are included.

- Tidings RSS catalog: original snapshot from Qiaomu RSS 0.32.9, CC0-1.0; catalog compilation license and ownership boundaries are retained under `vendor/tidings-rss`. No product screenshots or third-party article bodies are copied.
