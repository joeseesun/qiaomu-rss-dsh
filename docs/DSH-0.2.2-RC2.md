# DeepSeek Harness 0.2.2-rc.2 verification

Verified 2026-11-12 (America/Los_Angeles). Product 0.9.5, baseline v0.9.4 / `8b4b5055cd92bca5b19252729b434a9b6d9ed628`.

The old public tgz is rejected by the unmodified official rc.2 installer in an empty profile. This release explicitly adds only `0.2.2-rc.2` to the existing engines/DSH peers; untested future rc.3 remains rejected. Lock root metadata and bundled product identity are synchronized; the locked dependency graph is unchanged.

Upstream: [official rc.2 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.2). The official compatibility evaluator still gives engines.dsh precedence. Reviewed the actual sidebar slot, layout, Typert remote/gateway and tool contracts. The sidebar.panellist registration remains supported; these products do not wrap the changed session append API or depend on the old host overlay positioning API. RSS defines tools through defineTool and does not inspect obsolete error categories. No exemption is used.

## Verified

- Clean `npm ci`, existing `npm run check`, build and package audit pass.
- Official signed macOS arm64 rc.2 Desktop bundled CLI; signature and exact version rechecked. A separate DSH_HOME/workspace and web profile are used, with no daily-host changes.
- Candidate plugin install, composed configuration, host startup and every packaged installed file compared by size/SHA-256.
- 真实频道和文章正文加载、收藏、原生 AI 伴读输入框及已有草稿保护；宿主 tools.execute 成功调用 rss_list_channels，缺 key 的 rss_read_article 返回 INVALID_ARGS。

## Limits and recovery

未发送模型请求、未验收 TTS/媒体播放。首次伴读打开有延迟，随后成功；保留原始等待快照，不推断延迟根因。 Windows/Linux and older host versions were not rerun; retained older declarations are not new runtime evidence. No production publishing or paid model calls. Existing migration branches and primary-workspace edits are preserved.

Previous version remains available at [the prior release](https://github.com/joeseesun/qiaomu-rss-dsh/releases/tag/v0.9.4). Roll back by installing that tgz with the matching prior host; no data-format migration is introduced. Release assets and the independently downloaded public package are checked separately after merge.
