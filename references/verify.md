# Verify

先读取并应用 [共享状态重建规则](state-reconstruction.md)。检查项目上下文、Checkpoint、Handoff 与真实项目的一致性，不是全面代码审查或软件质量评分。

以当前阶段和下一步任务为范围，检查以下项目，分别标明已发现、未发现、未检查/不确定：

- Project Scope、Git Baseline、Working Tree。
- Checkpoint consistency、Handoff consistency：比较记录基线、相关未提交变化及当前任务；缺失时说明影响。
- Implementation claims：文档/TODO/任务的完成主张与实际实现、接线、验收是否一致。
- Validation claims：命令是否实际运行、基线是否适用，失败/受阻/未运行是否准确记录。
- Decisions / Constraints：有效决策与实际架构、实现偏差及未记录决定；不自行认可新实现为新决策。
- Evidence Gaps：缺失来源、可访问聊天/任务冲突、混杂阶段、重复失效讨论、矛盾下一步和未检查范围。

只在需要补足当前关键事实且安全、成本合理时执行共享规则允许的必要验证。使用共享的一致性状态，不另设健康等级、百分制、token 阈值或软件分数。

```text
Context Verification: Verified / Verified With Gaps / Drift Detected / Insufficient Evidence
Scope:
Project Scope / Git Baseline / Working Tree:
Checkpoint consistency:
Handoff consistency:
Implementation claims / Validation claims:
Decisions / Constraints:
Evidence Gaps:
Conflicts（每项）:
  Claim:
  Current Evidence:
  Assessment:
  Required / Recommended Action:
Next Recommended Action:
```

默认只读，报告后停止，不自动修正文档或调用 compress。用户明确要求“检查后同步”时，再按记录用途进入 checkpoint 或 compress 的写入流程；只有同时有正式交接意图才进入 handoff。建议新会话不能解决缺失证据，下一步仍须包含最小核实动作。
