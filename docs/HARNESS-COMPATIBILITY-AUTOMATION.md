# DSH 新版本兼容自动化：调研与接入方案

调研日期：2026-10-28。范围：乔木已发布的 9 个 DSH 插件；Agent 仓库仍是草稿，不计入可发版产品。

## 结论

可以共用「发现新宿主 → 测试矩阵 → 生成修复 PR → 产品验收 → 发布」流程。目前没有证据表明 DeepSeek Harness 能自动修复任意插件源码并保证产品行为不变。兼容声明、热重载、更新分发、源码适配是不同层次。

2026-10-31：已按用户授权在 Codex 当前聊天启用每日北京时间 10:00 的兼容维护任务（ID `dsh`），发现新主通道版本后执行适配、验证及既有 GitHub 发布流程；无更新时静默，完成、失败或需要用户动作时通知。以下为工程依据。定时任务依赖本机 Codex 的调度环境，不属于插件内置更新器。

## 已核对的机制

| 机制 | 能做什么 | 不能据此断言什么 |
| --- | --- | --- |
| [官方 rc3 兼容检查](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/boot/app-boot/src/plugin-compatibility.ts) | 优先判定 `engines.dsh`，缺失时回退 DSH peers；包含预发布版本比较 | 声明通过不等于 API、UI 和业务逻辑正确 |
| [官方插件管理器](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.3/packages/boot/plugin-manager) | 安装和管理 bundle、按能力重载插件 | HMR 不会改写过时 API；`allow-version` 只是特定版本豁免 |
| [官方 rc3 插件市场](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/boot/plugin-market/README.md) | 从自定义索引筛选最高兼容版本，提示 update-available | rc3 README 明确没有直接升级流程；仍需卸载再安装。索引支持 npm 或 Git commit 目标，不能直接把当前 Release tgz 当同一种索引目标 |
| [EasonMWS/dsh-plugin-health](https://github.com/EasonMWS/dsh-plugin-health) | 当前 README 对应 0.5.0：本地插件版本矩阵；以独立 DSH_HOME 安装包并运行 profile-boot，检查工具注册及调用结果 | 不自动改源码；命令行 smoke 不能证明浏览器页面或外部服务可用 |
| [PerryLink/dsh-plugin-upgrade](https://github.com/PerryLink/dsh-plugin-upgrade) | 扫描旧 API、提供迁移指南的思路可借鉴 | 已公开说明针对较早的固定版本区间，不能当作 rc3 通用修复器 |
| [ZK-Andy/dsh-continual-evolve](https://github.com/ZK-Andy/dsh-continual-evolve) | 对记忆、skills、提案做受控演化和回滚 | 不是产品仓库兼容升级系统，README 明确不直接写项目源码 |

上述第三方项目只核对了公开源码说明，未在本轮安装或运行。正式接入前需审核实现、许可证及依赖，固定提交或发行版本；不能直接跟随第三方 main 执行发布权限。

## 适合共用的维护层

用一份产品清单维护仓库、已发布版本、宿主范围、安装资产、验证命令和关键用户流程。现有仓库的 `npm run check` 保留为产品级入口，再复用同一套 Actions 工作流；无需给每个最终用户安装新的“自动进化”插件。

1. **发现**：由一个受控定时任务或手动触发器读取官方 DSH 新版本，记录目标版本与 commit。同一版本去重；发布候选版本走单独通道。
2. **评估**：同时检查公开 Release tgz 与仓库候选包。固定官方宿主版本，在矩阵中运行该版本自己的兼容评估器；复用 health 的 matrix 或实现等价调用。不能只比较源码 package.json。
3. **验证**：临时工作区构建、现有测试、打包；用空 DSH_HOME 原生安装、启动、调用产品工具，并运行下表的真实 UI 验收。记录工具输出、截图、版本、包 SHA256。
4. **适配**：失败时整理原始日志、上游 breaking changes 与最小复现。在 `codex/` 分支修复 host 适配层，生成 PR；最多有限轮重试，失败保留诊断，不扩大宿主范围掩盖问题。模型调用遵守既有 DeepSeek Flash 偏好及预算。
5. **发布**：所有必需检查通过后走现有 PR/CI/merge/release 流程；公开发布后匿名下载、校验 SHA256、第二次独立安装。运行结果与发布资产必须是相同内容。版本豁免不作为发布通过条件。
6. **回退**：保留上一稳定版下载和安装说明；升级不删除用户数据。涉及持久化格式变化时先提供兼容迁移和回退测试，再放行。

初期建议自动执行发现和评估、自动产出修复 PR；发布继续复用已有验收门槛。积累稳定样本后，才考虑把无需代码适配且全部检查通过的维护更新纳入自动发布规则。这是工程判断，不是上游已提供的承诺。

## 每个产品需要补齐的真实验收

| 产品 | 可共同检查 | 专属通过条件 |
| --- | --- | --- |
| RSS | 安装、加载、版本、错误日志 | 源列表、全文、原生伴读会话、未发送草稿保护；有测试凭证时才加模型调用 |
| Reader | 同上 | EPUB 打开、翻页、进度持久化、笔记；PDF 另设样本 |
| Home | 同上 | 替换主页、待办保存、来源 provider 联动、重启恢复 |
| Radio | 同上 | 频道目录与台站选择；音频流实际播放另设可控测试源 |
| UI Learn | 同上 | 图库、词典、详情及保存动作 |
| Cover | 同上 | 模板应用、编辑、撤销、导出 PNG 尺寸和内容 |
| Audio | 同上 | Markdown 保存及预览；TTS/STT 使用专门测试服务和凭证 |
| Publish | 同上 | Markdown 排版和本地保存；外发使用测试端点，不能操作用户微信客户端 |
| Blog Publisher | 同上 | 编辑、保存、测试站点发布及返回链接；不能向生产博客自动发测试文 |

这套维护流程也可迁移到 Obsidian、浏览器扩展等产品，但宿主检测、安装器和专属测试必须分别实现；DSH 的版本范围或 profile smoke 不能直接证明这些宿主兼容。

## 这次 rc3 给出的具体证据

RSS 公开 v0.8.0 缺少 engines.dsh，旧 DSH peers 导致 rc3 原生安装拒绝；源码 main 当时已有更新声明，说明只测 main 会漏掉用户实际下载的旧包。其他 8 个产品更新前的 main manifest 已通过 rc3 官方判断，不能把 peers 字面不一致都称为已复现故障。

另外四个原版适配层硬编码了显示版本，本次改为从本包 package.json 读取。自动验证应包含“运行界面显示的是本次版本”，而不只检查包文件名。

见 [rc3 验证记录](RC3-COMPATIBILITY.md)。
