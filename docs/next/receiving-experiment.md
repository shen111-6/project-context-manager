# 新会话接手与小任务实验（2026-10-11）

## 实验身份和计时范围

这是用户明确创建并授权的本次新 Codex 会话，初始目录为 pcm-receiving-experiment，随后按授权在现有 next-gui 工作区接手。没有创建其他聊天、调用外部 Agent 或子 Agent。本次有完整授权提示和本地交接资料，不能描述成完全无提示的盲测，也不是此前 alpha.1 合成项目独立恢复实验的重复记账。

所有时间均为 Asia/Shanghai（UTC+08:00）。首个工具时间戳为 2026-10-11 10:55:49；技能读取先于该时间戳，未采集准确会话起始时刻。交接、快照和打包结构读取于 10:56:17 已完成，随后核对快照校验和、当前文件及入口，并在修改前报告恢复结论。恢复耗时约 1 分钟（估算；不冒充精确计时）；从首个可用时间戳到重复打包和 ZIP 检查完成（10:58:32）为 2 分 42 秒，包含权限审批等待。精确端到端恢复耗时未采集，是本实验计时缺口。

## 实际读取与核实的信息

- 使用本机 project-context-manager SKILL.md、references/state-reconstruction.md 和 restore.md；按用户已明确授权的“恢复后继续小任务”执行。沿工作区祖先检查 AGENTS.md/AGENTS.override.md，并在 next-gui 查找嵌套指令，未发现适用文件。扩大查找遇到其他 validation-deps/python 目录权限拒绝，它们不属于本任务指令范围，未把它们视为本项目失败。
- 读取 docs/next/handoff.md、docs/next/current-context.md、docs/next/architecture.md、根 README/package.json、扩展 package.json/README/.vscodeignore、scripts/build-extension.mjs、tsconfig.json、.git。
- 读取 GUI 实际生成的 docs/project-context/pcm/index.json，以及 snapshots/5fcc27d9-55a7-4367-b4b7-c5a2e06ee8af/snapshot.json 与 handoff.md。记录生成于 10:48:30.363；schema_version 1、toolVersion 3.0.0-alpha.2；index 中 snapshot SHA256 与文件实际字节一致。
- 核对 GUI 快照中目标、断点、下一步、WIP、约束和验证字段；读取 result-host.ts/handoff.ts 的原项目绑定、发布成功后展示失败处理相关代码及 tests/gui-host.test.ts 对应断言。检查全部快照文件的当前 SHA256；这属于字节一致性检查，不是全部源码语义审计。
- 当前架构：protocol/engine/cli/adapters/vscode/evaluation；VS Code 扩展由 esbuild bundle，外部依赖仅 vscode，规则资源和第三方许可由既有 build 生成。现有根 scripts 没有 VSIX 打包入口，本地 @vscode/vsce 4.0.0 已安装。未安装或下载依赖。

## Git、断点和记录漂移

范围：[本地 next-gui 工作区]。分支 codex/next-gui；HEAD b59ba56f76d924dd90535f7f24703267014bb658，与手写交接和 GUI 快照一致。.git 是指向 next-repository 的 worktree 指针。读取状态时已有 18 个 tracked 修改和 7 个 untracked 条目（包括目录）；无暂存 diff 或合并冲突。已有改动由原工作保留，本次不切分支、不提交、不推送。

旧手写交接存在已确认漂移：它说尚未生成 docs/project-context，但当前真实 GUI 记录已存在；README 原先 alpha.1 的缺口已由主聊天改成 alpha.2；旧 VSIX 大小 91978，接手时实际 92227；旧记录的 14 tracked/4 untracked 已增加，GUI host 测试及原项目绑定/发布后错误提示已有实现。旧记录不再准确描述这些当前事实。旧 SHA 表中的 extension.ts/handoff.ts/result-host.ts 也与新 GUI 快照不同，不能因同一 HEAD 复用旧验证。

GUI 快照更接近当前状态：目标是 alpha.2 GUI 交接/恢复/冲突/异常/只读验收；断点记载原项目绑定和发布后提示修复、12 项定向测试/检查/构建历史通过；WIP 包括 GUI 冲突/损坏记录/只读、真实新会话接手实验及 README/证据同步。读取时相对该快照发生字节变化的文件为 README.md、docs/next/validation.md、scripts/test-extension.mjs、tests/extension-host.cjs；与主聊天仍在验收和更新文档一致。没有将这些变化自动判为缺陷。

结论：旧手写交接为 Drift Detected（上述具体事实）；最新 GUI 记录可支持本次接手，按语义为 Verified With Gaps / Ready With Gaps。snapshot 的 claims/validations/constraints/gaps 都为空，虽然 task.current 文本提到历史测试通过，它没有结构化验证执行证据。“No machine coverage gap”不证明语义完整；仍需发现当前项目约束。没有读取此前私人聊天或独立确认主聊天 GUI 操作、已加载扩展版本、完整 E2E、跨平台和跨 Agent 结果。此次只负责打包，不替主聊天更新 validation.md 或既有交接记录。

## 本次实现

- 根 package.json 新增 `package:vsix`: `npm run build && node scripts/package-vsix.mjs`，复用既有构建。
- 新增 scripts/package-vsix.mjs：通过根本地 node_modules 解析 VSCE 并用当前 Node 启动它；固定 `--no-dependencies --allow-missing-repository --skip-license`，不声明新的许可授权。只复制扩展 package.json、README.md、THIRD_PARTY_NOTICES.txt、dist/extension.cjs、resources/state-reconstruction.md 到独立临时目录；不复制工作区、源码、node_modules 或 .git。缺少必要产物会在打包前失败；清理前验证临时目录绝对路径在预期临时根下。
- 输出按扩展 name/version 定位到现有 ../../outputs；可重复执行并更新同版本 VSIX。根入口先 build；直接运行小脚本只使用现有 bundle，不验证产物新鲜度，README 明确说明。
- 根 README 仅新增本地开发打包用法与上述限制。alpha.2 版本说明在接手时已经存在，不计为本次修改。保留完整发布验收尚未通过的限制。

## 本次实际验证

执行目录均为上述 next-gui，2026-10-11 本次会话运行：

| 检查 | 结果和边界 |
| --- | --- |
| npm run check | Passed，tsc --noEmit，退出码 0；当前扩展/核心类型检查，不代表 GUI E2E。 |
| npm run package:vsix（两次） | Passed，两次退出码 0；均执行现有 tsc/esbuild build，然后本地 VSCE 真实打包，同版本输出更新成功。 |
| node --check scripts/package-vsix.mjs | Passed，退出码 0。 |
| VSIX ZIP 条目、清单与 bundle 校验 | Passed，通过本地 yauzl 读取全部 7 个条目，严格匹配下面清单；manifest version/main 正确，bundle 与当前本地产物逐字节相等。 |
| VS Code 安装、加载和 GUI 完整验收 | 本次 Not run，主聊天负责；不得由打包成功推导 GUI 验收通过。 |

输出：../../outputs/project-context-manager-3.0.0-alpha.2.vsix，92227 字节；本次最终 SHA256：63764500f8296910cfac20d922d6cdce1bc287e5fa72a9d521ec4b64df560772。可重复执行是操作可重跑，不承诺 ZIP 时间戳造成的归档字节可复现。

实际条目：

```text
extension.vsixmanifest
[Content_Types].xml
extension/package.json
extension/readme.md
extension/THIRD_PARTY_NOTICES.txt
extension/dist/extension.cjs
extension/resources/state-reconstruction.md
```

没有 .git、node_modules、工作区包、源码或测试文件。VSCE 警告临时目录没有 .vscodeignore/files 字段，并提示 bundle 较大；不是失败。此脚本通过固定文件复制清单限定内容，实际 ZIP 校验验证了这个范围。

## 实验局限与下一步

本次证据支持“新会话能读取真实 GUI 交接并在明确授权后完成一个打包小任务”，不支持量化总体恢复准确率、Token 优势或 GUI 阶段整体完成。计时缺少准确开始/恢复结束采样；历史执行日志和主聊天正在发生的 GUI 行为未由本会话重新验证；并行工作会使最新快照继续产生预期漂移。现有 handoff/current-context/GUI 不可变记录未修改，GUI 源码未修改。下一步由主聊天汇总本记录及其 GUI 验收证据，仍须保留未完成项。
