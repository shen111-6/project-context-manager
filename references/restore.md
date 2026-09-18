# Restore

先读取并应用 [共享状态重建规则](state-reconstruction.md)。恢复不另设可信度、实现分类或新鲜度标准。

## 工作流程

1. 确认范围后，依次读取适用 AGENTS.md、Handoff、Checkpoint，再按需读取 README/概述、架构、进度、决策、TODO/Issues。一个文件承担多种用途时只读一次，长文档按当前任务取相关部分。
2. 将 Handoff / Checkpoint 用作当前工作入口；根据其中 Evidence Scope / Verification Baseline，按共享规则核对当前 Git、相关代码和必要验证，确认影响当前任务的关键事实。
3. 若入口缺失，从现有材料重建；若入口失效，追踪受影响差异。无法确认的主张保留为不确定，不把读完 Handoff 等同于恢复成功。
4. 输出下列简短报告。缺失字段如实填写，不为凑齐结构编造任务、阶段或决策。
5. 单独 restore 完成报告后停止，默认不改写文件。只有用户已同时明确要求“恢复后继续开发”时，报告后接着执行其已授权任务；若明确同时要求同步文档，随后使用 compress 流程。

```text
Codex Context Restored

Project: 项目用途与目标
Architecture: 当前实际结构及主要技术栈
Current Stage: 当前阶段及判断依据
Last Completed: 最近确认成果与验证限定
Current Task: 当前工作、缺口或阻碍；未知时明示
Checkpoint: 路径、当前工作断点与适用性，或缺失及影响
Working Tree: 当前暂存/未暂存/相关未跟踪/冲突及与交接的差异
Validation: 实际状态、命令/目录、时间/基线、范围和限制
Next Step: 推荐的具体动作与验收条件
Known Issues: 当前问题和风险
Important Constraints: 开发规范及不能轻易改变的要求
Decisions to Preserve: 有依据的有效决策、理由摘要及记录位置
Handoff Consistency: Verified / Verified With Gaps / Drift Detected / Insufficient Evidence（按共享规则；缺失注明）
Ready To Continue: Yes / With Gaps / No，说明可继续的具体任务或阻断；不代表继续执行的授权
Freshness / Uncertainty: 核验范围、基线差异、未提交修改、冲突、验证状态与剩余缺口
```

报告应足以回答“项目做什么、如何构成、做到哪、刚完成什么、正在做什么、下一步做什么、有哪些约束/问题、哪些决策应保留”。无需复制完整 Handoff；用可访问路径支持关键结论。

资料仅部分可用时明确“部分恢复”，并指出是否已足以推进当前任务。不要自动转成全面代码审查、项目修复或全量文档同步。
