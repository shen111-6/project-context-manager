# Project Context Manager (local alpha)

打开本地项目后，在资源管理器的 **Project Context Manager** 中选择：交接项目、恢复项目、查看项目状态。

交接会自动读取 Git 和磁盘证据，必要时填写当前目标、开发断点与下一步，检查风险后生成实际 JSON/Markdown 记录。恢复默认只读，核对记录和当前文件后停止，不继续开发。未保存编辑不会自动保存或纳入磁盘快照。

高级操作提供 checkpoint、compress、verify、历史、文件证据/Git 差异，以及复制接收指令。Codex 语义分析需要已安装且独立登录的 CLI，并经当前用户选择；它返回候选判断，不能认证功能完成。Claude Code / Gemini CLI 本轮只有接口设计，没有可运行客户端。

此包尚未发布到 Marketplace。支持本地工作区；远程、跨平台完整验收、完整 Webview 点击测试与用户研究仍待执行。关键证据不足和漂移会显示在结果中，操作成功不等于交接就绪。工作区未受信任时不写记录或运行 Agent。自定义验证仅在 CLI 独立授权运行。

本地安装：VS Code 扩展菜单 → 从 VSIX 安装 → 选择提供的安装包。该包不声明开源许可证；第三方运行时代码许可证见 THIRD_PARTY_NOTICES.txt。
