# Status

先读取并应用 [共享状态重建规则](state-reconstruction.md)。本模块仅规定轻量读取和报告，不另设事实标准。

确认范围及适用指令，有限发现现有概述、current-work/Checkpoint 和 Handoff；检查 branch、HEAD、working tree，并只读当前任务所需的少量入口与相关差异。默认只读，不运行大范围测试、不全面读取项目，不自动同步记录。没有充分证据的阶段、任务或旧验证注明来源、unknown / uncertainty；Last Known Validation 不冒充本次通过。

输出：

```text
Project:
Current Stage:
Current Task:
Branch:
HEAD:
Working Tree:
Last Known Validation: 命令、状态、时间/基线与适用性；没有记录则 unknown
Checkpoint: 路径、是否存在、最近已知基线及是否已核验
Handoff: 路径、Purpose、是否存在、最近已知基线及是否已核验
Known Issues:
Next Recommended Action: 一个具体动作；必要时建议适合的模块
Evidence Scope / Uncertainty:
```

报告后停止；建议不会自动授权 checkpoint、compress 或正式 handoff。
