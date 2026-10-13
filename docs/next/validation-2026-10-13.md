# 当前验证：2026-10-13

环境：Windows、Node 24.18.0；next-gui 工作区，codex/next-gui，HEAD b59ba56f76d924dd90535f7f24703267014bb658，存在保留的未提交改动。本次从当前代码运行，不继承旧结果。

| 执行 | 结果 | 范围 |
| --- | --- | --- |
| npm test | Passed，8 文件、30 测试；42 秒 | 当前全部 Vitest 测试；不是 GUI 点击或所有平台通过 |
| npm run demo | Passed，构建和 7 个合成端到端场景 | 缺少记录、checkpoint、handoff、只读 restore、FILE_DRIFT、RECORD_CHANGED、预先取消 |
| 恢复只读断言 | Passed，五项 SHA256 一致 | counter.ts、Git index、交接索引和两项最新交接产物；不证明所有文件系统权限边界 |

演示原始结果保存在 Git 忽略的 outputs/demo/run-XCyhFl，各操作 JSON、summary.json 和 report.md 均实际生成。七场景概况另见 [演示概要](demo-2026-10-13.json)。演示开始 10:59:34、结束 10:59:48（Asia/Shanghai），不包含 build；这些是单次合成运行，不是效率/准确率研究。

当前 AI 运行证据仍为此前明确标注的 Codex 和新会话接手实验，本次演示未调用任何 Agent。尚未测试跨平台、运行中 GUI 取消/重试及 OS 权限拒绝；没有新用户研究或 216 次对照实验。简历材料只能使用已实现且有范围限定的能力和数字。

本次后续：新增 package:release，实际 ZIP/内嵌 VSIX 检查、解压 CLI 四场景和执行前篡改拒绝 Passed。见 [完整交付证据](delivery.md)。仅新增打包/检查脚本和开发依赖，运行的 build 包含当前类型检查；未将打包验证等同 GUI/平台验收。

GUI 后续补测：独立合成项目已准备，但工具先后返回 user input was detected、window is minimized，activate/refresh 后仍拒绝输入；没有观察到权限发布或重试行为，保持 Blocked/未执行。未施加 ACL 修改，不推断是用户操作造成。

后续当前源码：完整测试 9 文件/37 项 Passed；真实索引提交前后进程退出、Windows 写保护及取消目录遍历边界通过。新增 GUI 宿主事件测试通过，原生点击不据此认证。见 [故障验收](fault-acceptance-2026-10-13.md)。
