# DeepSeek Harness 0.2.2-rc.3 verification

Verified 2026-11-13 (America/Los_Angeles). Product 0.9.6, baseline v0.9.5 / `c8c24b7cc747894333b94cda10cdb40019164ac0`.

The old public tgz is rejected by the unmodified official rc.3 installer in an empty profile. This release explicitly adds only `0.2.2-rc.3` to the existing engines/DSH peers; untested future rc.4 remains rejected. Lock root metadata and bundled product identity are synchronized; the locked dependency graph is unchanged.

Upstream: [official rc.3 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.3). The official compatibility evaluator still gives engines.dsh precedence. Reviewed the actual sidebar slot, layout, Typert remote/gateway and tool contracts. The new sidebar.session.action HOC and workspace.picker factory are additive; sidebar.panellist and the existing directory-flow slots remain. The eight products do not own those directory-flow slots or the session archive exporter. Compatibility evaluator, Typert protocol, tools, gateway, remote-access and layout entry match rc.2 byte for byte. RSS tool invocation and native companion are tested on the new host. No exemption is used.

## Verified

- Clean `npm ci`, existing `npm run check`, build and package audit pass.
- Official signed macOS arm64 rc.3 Desktop bundled CLI; signature and exact version rechecked. A separate DSH_HOME/workspace and web profile are used, with no daily-host changes.
- Candidate plugin install, composed configuration, host startup and every packaged installed file compared by size/SHA-256.
- 真实频道和全文加载、收藏；原生伴读面板与输入框正常，快捷提示词保护已有草稿。真实宿主 rss_list_channels 成功，rss_read_article 缺参数返回 INVALID_ARGS。

## Limits and recovery

未发送付费模型请求，未复测 TTS/媒体。 Windows/Linux and older host versions were not rerun; retained older declarations are not new runtime evidence. No production publishing or paid model calls. Existing migration branches and primary-workspace edits are preserved.

Previous version remains available at [the prior release](https://github.com/joeseesun/qiaomu-rss-dsh/releases/tag/v0.9.5). Roll back by installing that tgz with the matching prior host; no data-format migration is introduced. Release assets and the independently downloaded public package are checked separately after merge.
