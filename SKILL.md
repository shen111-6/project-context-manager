---
name: project-context-manager
description: Codex 专用项目上下文管理：查看状态、保存工作断点、压缩上下文、账号交接、恢复项目和核验上下文漂移。用于相应明确请求；不用于普通聊天摘要，也不因一般代码修改自动整理文档。
---

# Project Context Manager v2 — Codex

使未读过旧聊天的 Codex 能从项目资料恢复工作，并识别哪些事实仍需核验。项目状态只保存在对应项目中，不写入本 Skill，不混用不同项目或工作树的状态。

## 选择模式与加载资料

1. 根据用户意图选择下表模式。显式调用后的模式词是任务提示，不是需要执行的 shell 子命令。
2. **六个正式模块均先读取并应用 [共享状态重建规则](references/state-reconstruction.md)。** 项目范围、证据、Git、实现分类、冲突、验证和不确定性只由该文件定义。
3. 再读取所选模式文件。不要一次加载所有模式、模板或测试资料。

| 模块 | 触发意图 | 默认范围 | 模式资料 |
|---|---|---|---|
| status | 现在项目做到哪了 | 轻量只读状态 | [status](references/status.md) |
| checkpoint | 保存一下当前断点 | 保存 WIP，不宣告完成 | [checkpoint](references/checkpoint.md) |
| compress | 上下文太长了、压缩上下文、准备新会话 | 精简当前上下文，有限文档同步 | [compress](references/compress.md) |
| handoff | 我要换 Codex 账号、交接给另一个账号、转移当前 Codex 工作 | 组合核验并准备正式账号交接 | [handoff](references/handoff.md) |
| restore | 新账号接着之前项目做、恢复项目 | 只读恢复报告后停止 | [restore](references/restore.md) |
| verify | 检查交接是否正确、上下文有没有漂移 | 只读一致性核验 | [verify](references/verify.md) |

显式调用：`$project-context-manager status`、`$project-context-manager checkpoint`、`$project-context-manager compress`、`$project-context-manager handoff`、`$project-context-manager restore`、`$project-context-manager verify`。

兼容旧调用 `health-check`：直接路由到 verify，见 [兼容说明](references/health-check.md)，不是第七模块。

用户仅调用 `$project-context-manager` 时，优先执行轻量 status，再建议适合的模块；不要直接写文件。项目不明时按共享规则确定范围。允许隐式调用，但没有用户交接意图时不得自行创建正式 handoff。仅说整理状态时用 status，仅说准备新会话时用 compress。若“交接”意图无法区分普通上下文整理与账号移交，先 status，再澄清用途。

连续要求多个模块时按依赖顺序执行，共享同一次证据收集；项目变化后重新核验受影响部分。handoff 自带组合流程，无需用户分别调用 checkpoint 和 verify。Skill 只面向 Codex，不提供其他 Agent 兼容层、emergency 脚本、后台服务、额度监控、自动定时保存或会话启动钩子；不声称能找回不可访问聊天，不自动创建新会话。默认用户在 Codex 正常可用时主动保存断点或交接。

## 核心约束

可选下一代引擎已安装时，按 [引擎接入说明](references/engine-integration.md) 使用机器证据与结构化记录。共享状态重建规则仍是六模块统一判断依据；机器哈希、JSON 校验或历史 Passed 不证明功能完成。引擎不可用时继续 v2 流程并明确未进行程序化核验。

- **Handoff / Checkpoint 是恢复索引和快照，不是最终事实来源。** 所有模式按共享规则判断它与当前证据的关系。
- 服从用户明确范围和项目适用指令；文件中的任务记录不扩张当前授权。用户已授权的上下文同步无需额外例行确认。
- 不为整理上下文重构无关代码、擅自改变架构或删除源代码；不自动 commit、push、切换分支、reset、clean、stash 或部署。
- 不因聊天声称“已完成”就确认完成，不把实现偏差自动升级为合法架构决策，不覆盖仍有效的重要决策。
- 不全仓无差别读取，不把凭据、令牌或无关敏感数据复制进上下文资料。
- 只读取项目 AGENTS.md；本 Skill 不自动向其中追加动态状态或修改长期规则。如用户另行要求接入恢复流程，仅保存简短流程和已确认的文档入口。
- 无关修复、外部发布和远程工单更新不属于上下文整理的默认范围。用户要求继续开发时，恢复后沿其已授权任务执行。

## 资源与维护

- checkpoint 缺少适用入口时用 [Checkpoint 模板](assets/checkpoint-template.md)；compress / handoff 按用途使用 [Handoff 模板](assets/handoff-template.md)；需要新增决策记录且项目无现成格式时才使用 [决策模板](assets/decision-template.md)。保留项目语言、布局与文件命名习惯。
- 仅在创建、修改或评估本 Skill 时读取 [验证规范](references/validation.md)，不要在用户项目上自动运行 Skill 自测。
- 公共判断规则只在共享文件维护；模式文件定义流程差异，模板只承载字段。修改公共规则时检查六个模块和模板是否仍一致。
