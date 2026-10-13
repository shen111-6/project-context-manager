# alpha.2 GUI 验收（2026-10-11，本会话）

范围：Windows、现有 next-gui 工作区和专用 gui-profile/gui-extensions。分支 codex/next-gui，HEAD b59ba56f76d924dd90535f7f24703267014bb658，保留原有未提交改动。以下是本次实际运行结果，不继承历史 Passed。

## 已完成修复

- 结果页 handoff/history/status 后续操作传递原 WorkspaceFolder，避免多项目选择改变目标。
- 交接包写入后核验或展示失败时，显示“交接包已生成，结果展示未完成”及真实路径，不再误报未生成；禁止重复发布。
- M2 直接验证 CLAIM_EVIDENCE_CONFLICT：证据未变不报冲突，内容变化或文件缺失报冲突。
- 新增事件级 GUI host 回归及真实双项目扩展宿主回归。
- README 当前源码版本同步 alpha.2；完整阶段验收限制保留。

## 本次执行证据

| 验证 | 结果及范围 |
| --- | --- |
| npm run check | Passed，当前 GUI 修复类型检查 |
| npm test -- tests/gui.test.ts tests/presentation.test.ts tests/m2.test.ts | Passed，3 文件 10 测试，最后一次 10:44 Asia/Shanghai；包含证据不变/变化/缺失断言 |
| npm test -- tests/gui-host.test.ts | Passed，2 测试，10:45；原项目绑定、拒绝额外项目参数、发布后展示失败不误报写入失败 |
| npm run build | Passed，当前扩展及 CLI bundle |
| npm run check:structure | Passed，共享规则、六模块、Markdown 引用 |
| PCM_VSCODE_PATH=D:/Microsoft VS Code/Code.exe npm run test:extension | Passed，10:51，真实 VS Code 1.107.0 双项目工作区，状态/缺少记录/未保存编辑/指定原项目命令 |
| VSIX 打包和隔离配置安装 | Passed，vsce package --no-dependencies；7 文件约 90 KB，仅 bundle/resources/package/readme/notices，无工作区源码和 .git |

初始 Vitest 在只读沙箱中因无法写 .vite-temp 启动受阻，升级工具权限后成功。扩展宿主测试初次运行因新增工作区引起重载而中断，第二次暴露测试夹具 Windows 盘符大小写比较问题；改为启动即双项目工作区并规范化路径后最终退出码 0。VS Code 输出 mutex/cached-data 警告，最终测试仍实际完成；不以警告代替失败断言。

## 真实 GUI 操作

1. 专用 VS Code 加载 alpha.2。安装后的 extension.cjs 与当前构建 SHA256 一致：3475B41233844882F40B6620B2BC6CD153D857AA869E00C175FA5A12EEC9B690。
2. 当前项目无结构化记录时点击恢复：显示“没有找到交接资料”、NO_RECORD、生成交接入口，未误报成功；界面显示检查 1.9 秒。
3. 从结果页进入交接，填写实际目标/断点/下一步及三行 WIP，准备预览后点击生成。实际创建 docs/project-context/pcm/index.json 和 snapshots/5fcc27d9-55a7-4367-b4b7-c5a2e06ee8af/{snapshot.json,handoff.md}。GUI 正确显示已生成、真实路径、任务和三项 WIP。67.7 秒界面耗时包括表单输入与预览停留，不是引擎基准。
4. 点击恢复刚生成的记录：显示“已读取交接，语义仍待核实”，三项 WIP 和下一步完整；界面显示 3.3 秒。恢复前后 index.json、snapshot.json、handoff.md、extension.ts、handoff.ts、Git index 的六项 SHA256 完全相同，只读范围验证通过。
5. 同步 README 版本后重新检查：显示“发现冲突，需要重新核实”、历史任务标题及 README.md 的 FILE_DRIFT；检查 3.4 秒，没有将历史任务当成当前完成状态。
6. 复制接收指令：实际出现“接收指令已复制；尚未调用 Agent，也没有开始开发。”反馈。
7. 在 outputs/gui-invalid-fixture 合成项目中复制记录并仅损坏夹具 snapshot.json。真实 GUI 恢复显示“操作未完成”、RECORD_CHANGED、保留原件提示和选择历史记录入口；检查 1.0 秒。原项目记录未改写。该夹具在 Git 忽略的 outputs 中保留供复查。

窗口工具曾返回 user input was detected 和 coordinate input geometry is unavailable。它们是工具输入拒绝，不能证明用户实际操作，也不算产品失败；重新观察并激活目标窗口后操作成功。未操作任何信任/登录/安全提示。

## 未完成及限制

- 操作系统权限拒绝下的 GUI 发布、窗口取消/失败重试的完整点击验收尚未执行。当前已验证恢复不写入及扩展宿主未保存缓冲区隔离，不能据此宣称全部权限边界完成。
- 完整多项目手工 GUI 选择链路、所有高级入口仍未穷尽；当前原项目绑定有事件测试和真实扩展宿主验证。
- 用户授权的新会话接手与真实打包小任务已完成并经主聊天核对。详见 [新会话接手实验](receiving-experiment.md)：识别过时信息，新增 package:vsix，本次类型检查、两次真实打包和 ZIP 结构检查通过；这不是无提示盲测，精确恢复计时未采集。
- macOS/Linux、用户研究和外部 Agent 实测未执行，当前不可宣称公开 Beta 完成。
- GUI 生成的不可变记录随后出现合理源码/文档变化；保留它作为实际验收证据，后续恢复应如实报告漂移，不篡改原记录以隐藏差异。

最终补充：GUI 取消检查入口的尝试被工具先后拒绝（element is not available in cached app state；刷新后 user input was detected），未观察到实际取消结果，保持 Blocked/未完成，不归因于用户操作。git diff --check 最终通过（保留 Git 的 CRLF 提示）。
