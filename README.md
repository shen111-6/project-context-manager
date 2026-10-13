# Project Context Manager — 下一代本地 Alpha

保留 Codex v2 六模块 Skill，新增独立 TypeScript 引擎、结构化交接记录、CLI 和真实 VS Code 图形界面。用户入口只有 **交接项目、恢复项目、查看状态**。

当前交付为 `3.0.0-alpha.2`，交接协议为 `schema_version: 1`。这是本地可用性与核心工作流验证版本，尚未通过完整发布验收。

## 快速演示与项目展示

`npm run demo` 可离线运行七个有断言的交接/恢复场景，保留原始 JSON 和只读校验结果，无需 Agent 登录。见 [演示指南](docs/demo.md)、[AI 岗位项目展示与简历描述](docs/showcase.md) 和 [当前收尾清单](docs/next/completion.md)。这些材料引用实际验证，不宣称未测试的性能或准确率提升。

## 优势

- **接手有依据。** 记录任务、WIP、下一步和 Git/文件基线；没有旧聊天也能从项目和记录恢复。
- **不把历史声明当完成证明。** 当前证据、漂移、失效验证和未知项分别报告；机器指纹相同不代表功能完整。
- **真实保护开发现场。** 分别识别 HEAD、索引、磁盘与未跟踪文件，区分 Worktree；查看、恢复和核验默认只读。
- **操作简单，细节可查。** 三个核心入口自动识别工作区；风险直接显示，完整证据与 Git 差异可展开查看。
- **同一引擎，多种入口。** GUI、CLI 与原 Skill 共用证据规则；版本化 JSON、不可变快照和并发冲突拒绝方便维护。

恢复需要可访问的必要项目文件。工具不搬运源码、不自动保存编辑器缓冲区，不执行交接中夹带的命令，也不自动继续开发。

## 使用 GUI

将提供的 VSIX 通过 VS Code「扩展 → 从 VSIX 安装」安装，打开本地项目，在资源管理器的 Project Context Manager 中选择操作。

交接：点击交接 → 必要时补充任务并检查风险 → 生成 JSON/Markdown。已有完整任务记录时无需重复填写。生成记录后仍需要接收方核实语义。

恢复：点击恢复 → 自动核验适用记录 → 查看断点、冲突和下一步。未找到记录会解释如何处理，不显示恢复成功。

高级入口保留 checkpoint、compress、verify、历史、文件证据/Git 差异、复制接收指令，以及独立授权的 Codex 语义分析。范围和记录路径可通过 CLI 指定。未受信任工作区不写记录或运行 Agent。

## 使用 CLI

需要 Node.js ≥22.12；Git 机器检查需要系统 Git。交付包内的 `dist/pcm.cjs` 可直接运行，无需 Agent 登录或网络：

```sh
node dist/pcm.cjs status /path/to/project
node dist/pcm.cjs preview /path/to/project --task /path/to/current-task.json
node dist/pcm.cjs checkpoint /path/to/project --task /path/to/current-task.json
node dist/pcm.cjs handoff /path/to/project
node dist/pcm.cjs restore /path/to/project
node dist/pcm.cjs verify /path/to/project
node dist/pcm.cjs evidence /path/to/project src/app.ts
```

六模块、默认 status 和 `health-check` 别名保留。任务 JSON 为 `{ "goal": "目标", "current": "断点", "next": "下一步", "workInProgress": ["未完成工作"] }`；未知项用 null。位置可通过 `--store docs/project-context/pcm` 指定，位置在 preview 中可见；默认沿用适用上下文目录，在其下新增 pcm 记录，不覆盖 v2 Markdown。

普通操作退出码：0 操作成功，1 失败，2 部分成功/待核实，130 取消。`analyze` 的候选结果仍使用 2；不代表已经认证项目完成。

自定义验证必须是当前用户独立授权，可能写项目。Readonly 模块不自动运行它：

```sh
node dist/pcm.cjs validate-run /path/to/project --allow-project-side-effects '["node","tests/check.js"]'
```

引擎采用参数数组，不启动 shell；不接受 shell/Git 执行器作为此入口。结果分别记录 Passed、Failed、Blocked、Not run、Incomplete，执行中基线变化不会继续认证为当前 Passed。用户选择的验证代码不是沙箱；超时不保证终止其所有后代进程。

## 完整本地交付

`npm run package:release` 生成包含 CLI、VSIX、说明、Schema 和验证材料的版本化 ZIP，检查内容后解压运行独立 CLI 自检，并验证篡改拒绝。见 [交付指南与本次证据](docs/next/delivery.md)。解压包内运行 `node verify.mjs` 可检查文件哈希和合成工作流；这不等于全部产品发布验收通过。

## 原有 Skill 与 Agent 接口

[SKILL.md](SKILL.md) 和 references/assets/agents 保留。安装和原调用见 [v2 使用说明](docs/v2-README.md)；可选引擎接入见 [说明](references/engine-integration.md)。引擎不可用时仍可按 v2 规则操作，但没有程序化核验。

| Agent       | 本轮状态                                            |
| ----------- | --------------------------------------------------- |
| Codex       | 实际 CLI 适配器；独立恢复与错误完成声明冲突实测通过 |
| Claude Code | 仅中立接口和技术设计，无运行客户端，无登录/实测     |
| Gemini CLI  | 仅中立接口和技术设计，无运行客户端，无登录/实测     |

两种接口共用证据来源、候选结果、不确定性、取消与能力检测契约。详见 [接口定义](packages/adapters/src/ports.ts) 和 [接入设计](docs/next/m4.md)。真实双向恢复通过前，不宣称跨 Agent 正式支持。账号凭据和内部会话不读取或迁移。

## 工程与实际验收

```sh
npm ci --ignore-scripts
npm run check
npm test -- tests/m5.test.ts
npm run build
npm run test:extension
```

### 本地开发打包

安装开发依赖后，在项目根目录执行：

```sh
npm run check
npm run package:vsix
```

`package:vsix` 先运行现有 build，生成扩展 bundle，再调用本地已安装的 `@vscode/vsce`，以 `--no-dependencies` 打包；不下载或调用全局 VSCE。仅扩展清单、扩展 README、第三方许可通知、`dist/extension.cjs` 和规则资源进入临时打包目录，工作区依赖、源码及 `.git` 不会进入 VSIX。

输出为项目外层现有 `../../outputs/project-context-manager-<扩展版本>.vsix`；重复运行会更新同版本文件。已完成 build 时可直接执行 `node scripts/package-vsix.mjs`，它只打包现有产物，不检查 bundle 是否对应最新源码；缺少必要产物时会失败。通过 VS Code「从 VSIX 安装」安装生成的文件。

打包成功仅证明本地安装包生成成功；alpha 阶段的完整 GUI、跨平台、用户研究及跨 Agent 验收仍未全部完成，不能据此宣称正式发布就绪。

模块位于 packages/protocol、engine、cli、adapters、vscode、evaluation；阶段设计保存在 docs/next。扩展测试使用独立 VS Code 配置和临时项目。三平台 CI 已配置，尚未实际运行 macOS/Linux。

本机核心验收：基础结构 PASS；checkpoint → handoff → 无旧聊天独立 Codex → restore PASS；错误完成声明冲突 PASS。新增路径、范围、验证执行、并发写入及发布后检查、扩展命令和评分工具有实际针对性测试。详见 [执行记录](docs/next/validation.md)。

[评估工具](docs/next/m6.md) 生成 216 次可重复实验排程并对真实人工复核数据评分；目前实验未执行，12 个样例仅为设计分类。未宣称准确率、Token 优势或用户研究通过。

尚待完整 Webview 点击 E2E、12 人 UX 研究、三平台/大型项目/故障验收、跨 Agent 客户端和双向实测。远程工作区、桌面第二客户端、源码搬运、云同步和后台自动保存不在本次范围。敏感内容采用默认路径排除和已知模式脱敏，不能保证识别任意秘密；本地路径检查不等同恶意文件系统沙箱。

本地交付未推送 GitHub、未发布 Marketplace。仓库原先未提供许可证，本次不擅自声明开源授权；打包运行时的第三方许可另附。

Git 采集范围是受管理文件与未被忽略的未跟踪文件；Git 忽略的必要文件需显式选择并核验，不能把默认清单当作所有文件已齐备的证明。手动重跑付费 Codex 核心验收：

    npx tsx scripts/acceptance.ts --allow-agent-calls

脚本只创建合成项目，保存候选结果；需要人工审查后报告通过，不在默认测试中运行。
