# AI Handoff

> 恢复工作的索引和当前快照，不是最终事实来源。恢复时按当前项目范围重新核对 Git、相关代码和必要验证。沿用已有项目格式时保留以下语义；填入实际信息，未知/不适用明确说明。

## Project / Goal

项目用途、目标、主要技术栈；概述文档相对路径。

## Current Stage

当前阶段及证据；区分已达成和仍待验收的目标。

## Architecture / Important Modules

实际架构与关键调用/数据关系；当前任务相关文件、目录及符号；详细架构文档入口。

## Completed

近期确认成果，附实现状态、证据及验证限定；完整进度入口。

## Current Work

正在做的任务、相关修改、已推进部分、剩余缺口和阻碍。

## Pending

当前阶段优先待办；完整 TODO/backlog 入口。

## Important Decisions

有效决策的结论、理由、影响与记录位置。缺少理由或批准依据时如实标记。

## Constraints

当前工作必须遵守的要求、适用规范入口及重要兼容性限制。

## Known Issues

仍影响开发的 Bug、风险、技术债、实现偏差和待同步文档；每项给出影响和下一步。

## Tests / Validation

| Command / Working Directory | Status | Time / Baseline | Scope / Result / Limitation |
|---|---|---|---|

按共享规则填写实际记录；未运行、失败或阻碍均如实记录，不粘贴完整日志。

## Important Commands

从项目已确认的运行/开发/验证入口提取命令、执行目录及必要前置条件。区分已运行和仅查得的命令，不包含凭据值。

## Next Recommended Action

一个首选任务：具体模块/文件、动作、验收方式、前置条件。存在关键证据缺口时先安排核实。

## Do Not Reconsider Unless Necessary

已接受且仍有效的决策、理由摘要、记录位置，以及允许重审的新证据/条件。不重复完整 ADR。

## Evidence Scope / Verification Baseline

| Field | Recorded Evidence |
|---|---|
| Repository / Project Scope | 项目标识及本次范围 |
| Subproject | 相关子项目或不适用 |
| Branch | 实际分支/分离状态，或不可用原因 |
| HEAD | 实际提交标识，或无提交/不适用/不可读取原因 |
| Working Tree | 文档写入前采集；暂存/未暂存/相关未跟踪或冲突状态，以及相关改动摘要 |
| Relevant Files Inspected | 实际检查过的关键文件/符号及支持的结论 |
| Validation Run | 引用上面的实际验证表；没有执行也注明原因 |
| Last Verified | 实际核验时间及明确时区 |
| Evidence Gaps | 未检查范围、缺失来源、未验证事项及冲突；没有已知缺口时仍注明范围限定 |
