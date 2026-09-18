# Codex Account Handoff

先读取并应用 [共享状态重建规则](state-reconstruction.md)。仅在用户明确表达换账号、交接或转移当前 Codex 工作时进入正式 handoff；不要因为模型判断“可能需要”而创建。

这是一次组合流程，不要求用户分别运行各模块：

1. 重建真实项目状态，定位现有文档和正式 Handoff 入口。
2. 获取最新 current-work / Checkpoint，并以当前证据校正其过时主张；没有 Checkpoint 时从项目重建，明确缺失，不强制另建一份。
3. 检查 branch / HEAD / working tree，包括接收方需要的未提交和未跟踪修改。
4. 定向检查关键实现状态和必要验证，区分已验证成果、WIP、失败和证据缺口。
5. 核对关键决策、理由与约束。
6. 按共享一致性状态检查已有 Handoff 与当前证据的冲突；记录修正依据，未解决冲突保留为缺口。
7. 复用现有格式或 [Handoff 模板](../assets/handoff-template.md)，更新/生成正式 Handoff。应用共享有限写入规则；不修改源码，不自动 commit/push/stash，不要求 clean。
8. 按共享准备度输出 Handoff Readiness。Prepared From 指文档写入前基线；确认接收方可访问同一个项目和所需 dirty 内容，不自动传输文件。

最终输出：

```text
Codex Handoff Prepared
Handoff: 实际文件入口
Handoff Status: Ready / Ready With Gaps / Not Ready
Checkpoint reference: 实际路径或 missing 与影响
Prepared From: branch / HEAD / working tree
Consistency: 当前已核验结论；列出已纠正漂移和未解决项
Evidence Gaps / Blockers:
Next Recommended Action:
Receiving Codex startup instruction: $project-context-manager restore
```

告诉用户：新 Codex 账号打开同一个项目后运行 `$project-context-manager restore`。Prepared 只表示交接记录已准备，不等于 Ready；Not Ready 时明确阻断项及最小解决动作。若无法写入，报告 Blocked 和原因，不声称文件已生成。
