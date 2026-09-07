# Project Context Manager

为长期软件开发提供项目上下文压缩、交接、恢复与健康检查的 Agent Skill。

它从当前代码、Git、项目文档和任务记录重建项目状态，使未读过旧聊天的 Agent 能定位证据并继续工作。**Handoff 是恢复入口与当前快照，不是最终事实来源。**

## 三种模式

| 模式 | 用途 | 默认文件操作 |
|---|---|---|
| `compress` | 重建当前状态、维护 Handoff、保留决定与下一步 | 重点更新交接；仅在明确必要时有限同步其他文档 |
| `restore` | 读取项目记忆并根据当前 Git、相关代码和必要验证重新确认 | 只读并报告；继续开发需有相应任务授权 |
| `health-check` | 检查资料一致性和证据缺口，给出 Good / Warning / Poor | 只读并报告 |

## 获取与安装

下载本仓库的 ZIP，或者克隆：

```sh
git clone https://github.com/shen111-6/project-context-manager.git
```

将包含 `SKILL.md` 的完整目录安装到目标 Agent 支持的技能目录。不同宿主的安装位置和调用语法可能不同，请让目标 Agent 确认它能够加载入口文件及所有相对引用。不要只复制 `SKILL.md`。

可以将以下提示连同完整目录交给目标 Agent：

```text
请安装这个 project-context-manager Skill，保留完整目录和文件。
按照你所在 Agent 的技能机制选择安装位置，确认可以加载 SKILL.md 及其引用资料。
安装后告诉我 compress、restore、health-check 的调用方式。
暂时不要在真实项目上运行；如果不支持此格式，请说明需要的适配。
```

## 调用示例

在支持 `$skill-name` 调用的 Codex 项目会话中：

```text
$project-context-manager compress
压缩当前项目上下文，重点更新 Handoff，记录证据基线和下一步。
```

```text
$project-context-manager restore
恢复当前项目上下文，核验相关代码与 Git 状态，输出恢复报告。
```

```text
$project-context-manager health-check
检查当前上下文健康度，报告等级、依据及是否建议开启新会话。
```

其他 Agent 请使用其支持的技能调用方式，或明确要求先读取 `SKILL.md` 再执行相应模式。`agents/openai.yaml` 提供 Codex 界面信息与调用策略，其他宿主可能不使用它。

## 工作原则

- 判断当前实现事实时，以代码、Git 和可核验资料为依据；聊天中的“已完成”不能替代实现和验证。
- 区分实际实现与有效架构决策：实现偏差不会自动成为合法的新决定。
- 优先复用项目已有文档体系，不强制创建固定七份文档。
- 按最小充分上下文维护当前快照，不累积聊天流水账；100–180 行仅为软参考。
- 交接记录项目范围、分支、HEAD、工作区、已读文件、实际验证、核验时间及证据缺口。
- 不为整理上下文重构代码、删除源码、改变架构或自动 commit/push。

Skill 包保存通用方法，不保存具体项目的记忆。交接一个实际项目时，还需提供项目代码及该项目的 Handoff、决策和状态文档。

## 目录

```text
project-context-manager/
├── SKILL.md
├── agents/openai.yaml
├── references/
│   ├── state-reconstruction.md
│   ├── compress.md
│   ├── restore.md
│   ├── health-check.md
│   └── validation.md
└── assets/
    ├── handoff-template.md
    └── decision-template.md
```

三个模式统一使用 `references/state-reconstruction.md` 的公共判断规则，只按需加载对应模式资料。模板保留关键字段，适配项目已有命名与布局。

## 验证情况与边界

已通过结构校验及一次 Codex 隔离行为验收：10 个小型 Python 标准库样例，12 次完成的模式执行，覆盖虚假完成声明、相同 HEAD 的未提交变化、ADR 冲突、无旧聊天恢复、重复压缩和健康分级。另有两次未取得完整结果的尝试被排除，并由新代理重新执行。

该结果不代表其他 Agent、大型仓库、任意长期重复运行或所有环境均已验证。验证规范见 `references/validation.md`。迁移后建议先使用隔离样例确认行为。

Skill 不提供后台监控，也不保证每次会话启动都会自动执行；不能恢复未保存且不可访问的旧聊天。使用方需要提供项目文件访问能力、Git 与适用的本地验证能力，压缩模式还需要文档写入权限。
