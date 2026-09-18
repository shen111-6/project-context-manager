# Project Context Manager v2 for Codex

为 Codex 长期软件开发提供状态查看、工作断点、上下文压缩、账号交接、恢复与一致性核验。没有旧聊天的 Codex 也能从项目资料定位证据。Handoff / Checkpoint 是恢复入口和快照，不是最终事实来源。

## 这个 Skill 的优势

- **换会话、换账号时减少重复交代。** 将目标、当前任务、关键约束和下一步保存在项目中；接收方可通过 `restore` 重建状态，无需依赖旧聊天。
- **保留真实开发断点。** `checkpoint` 能记录部分实现、未提交修改、失败测试和阻碍，避免把“做到一半”误当成“已经完成”。
- **恢复前重新核实，降低过时记录带来的误导。** 对照当前代码、Git 和必要验证检查 Handoff / Checkpoint；发现冲突时明确报告，而不是直接沿用旧结论。
- **按需要选择操作，控制上下文整理成本。** 日常查看用轻量 `status`，开发中保存用 `checkpoint`，上下文过长用 `compress`，账号移交才用 `handoff`；不必每次执行完整交接。
- **保留决策理由，减少重复讨论。** 记录有效决策、约束及重新评估条件，同时区分已接受的决定与代码中的实现偏差。
- **适配已有项目，接入负担小。** 优先复用现有文档，不强制固定目录；Skill 本身不需要数据库或后台服务。查看、恢复和核验默认只读，写入模式只做必要的上下文同步。

这些优势来自明确的流程和证据规则，不意味着能自动找回未保存的工作；可靠恢复仍需要可访问的项目文件和准确记录。

## 六个正式模块

| 模块 | 用途 | 默认文件操作 |
|---|---|---|
| `status` | 快速查看当前真实状态和下一动作 | 轻量只读，不全面读取或大范围测试 |
| `checkpoint` | 保存当前 WIP、失败、阻碍与精确下一步 | 优先更新现有 checkpoint/current-work |
| `compress` | 当前 Codex 继续开发时精简上下文 | 维护 current context snapshot，必要时有限同步 |
| `handoff` | 明确转移当前 Codex 工作或切换账号 | 组合核验并生成正式 Handoff 和准备度 |
| `restore` | 接收方恢复项目 | 核对真实代码/Git，报告后停止 |
| `verify` | 检查上下文、Checkpoint、Handoff 与实际是否一致 | 只读报告，不自动修正文档 |

## 获取与安装

下载完整 Skill 目录，安装到 Codex 的个人技能目录 `$CODEX_HOME/skills/project-context-manager`（未设置时为 `~/.codex/skills/project-context-manager`）。保留 `SKILL.md`、`agents`、`references`、`assets` 的完整结构，不只复制入口。已安装旧版时用完整 v2 目录替换，避免混用旧文件；在新的 Codex 会话中确认加载的是 v2，再用隔离样例验收。

本 Skill 只面向 Codex，不提供其他 Agent 的调用或适配层。

## 调用

```text
$project-context-manager status
$project-context-manager checkpoint
$project-context-manager compress
$project-context-manager handoff
$project-context-manager restore
$project-context-manager verify
```

模式词是 Codex 任务提示，不是 shell 子命令。仅调用 `$project-context-manager` 默认 status，再建议下一模块，不直接修改文件。支持自然语言隐式调用：“现在项目做到哪了”“保存一下当前断点”“压缩上下文”“我要换 Codex 账号”“恢复项目”“检查上下文有没有漂移”。没有用户交接意图时不会创建正式账号 Handoff。

## 典型流程

日常开发：status → 开发工作 → checkpoint；上下文过长时 compress，需检查记录是否仍适用时 verify。WIP、dirty 工作区、失败测试和未验证内容均如实保留，不伪装完成。

账号交接：

```text
Codex Account A
$project-context-manager handoff
→ Handoff Ready（或 Ready With Gaps / Not Ready，并解释原因）
→ 切换 Codex 账号，打开同一个项目及所需文件
Codex Account B
$project-context-manager restore
→ Restore Report
→ 用户确认后继续开发
```

若用户已同时明确授权“恢复后继续开发”，恢复报告后可继续该任务，无需重复确认。单独 restore 报告后停止。handoff 不自动传输代码或未提交内容；接收方需能访问实际项目文件。dirty 本身不阻止交接，但缺失关键修改会影响准备度。

## 工作原则

- 当前代码 > Git > 项目文档 > 当前任务记录 > 聊天记录；真实实现不能自动覆盖有效约束或合法化实现偏差。
- 六模块共用 `references/state-reconstruction.md`；模板承载字段，不定义新的事实标准。
- 优先复用项目文档，不强制 `.project-context` 或固定一套文件；只做有限同步。
- 最小充分上下文，不累积聊天流水账；100–180 行仅为压缩软参考，关键约束、决策理由、风险和证据不可为了行数删除。
- 不自动 commit/push/reset/clean/stash/deploy，不因整理上下文修改源码，不复制凭据，不全仓无差别扫描。
- 不保存模型私有推理。Skill 包只保存方法，项目记忆保存在对应项目中。

## 目录

```text
project-context-manager/
├── SKILL.md
├── README.md
├── agents/openai.yaml
├── references/
│   ├── state-reconstruction.md
│   ├── status.md
│   ├── checkpoint.md
│   ├── compress.md
│   ├── handoff.md
│   ├── restore.md
│   ├── verify.md
│   ├── health-check.md
│   └── validation.md
└── assets/
    ├── checkpoint-template.md
    ├── handoff-template.md
    └── decision-template.md
```

## 从旧版升级

`compress`、`restore` 仍可调用；普通压缩不再表示正式账号交接，需要正式交接请使用 `handoff`。无模式调用由 health-check 改为 status。旧 Handoff 无新字段时仍可作为定位资料读取；缺失基线/Purpose/Checkpoint 如实记录，不强制迁移，不推断正式就绪。

`health-check` 保留轻量别名，路由 verify；输出改为 Verified / Verified With Gaps / Drift Detected / Insufficient Evidence。依赖旧 Good / Warning / Poor 文本的自动处理需调整，不能机械映射。新的只读模式不会替用户自动补齐旧文档。

## 验证与边界

默认采用 3+1 验收：基础结构、一次核心交接恢复链路、一次冲突测试，另按实际修改范围追加。历史边界仅作为可选 Full Regression。验收规范见 [references/validation.md](references/validation.md)。格式校验与实际隔离行为验收分别报告，旧版测试结果不自动继承为 v2 通过。

本次 v2 核心验收通过：基础结构 PASS；最小隔离项目的 checkpoint → handoff → 无旧聊天独立 restore 主流程 PASS；虚假完成声明的冲突检测 PASS。恢复与核验未改写测试项目。未执行完整回归，尚未覆盖大型多模块仓库、并行文档修改、跨工作树文件缺失及真实提交历史漂移；未在真实用户项目上测试。

不包含运行脚本、数据库、后台服务、自动 quota 检测、定时保存或跨 Agent 兼容层；默认用户在 Codex 正常可用时主动 checkpoint/handoff。不能恢复未保存且不可访问的旧聊天；本地文件、Git 和适用验证工具的可用性决定核验范围。
