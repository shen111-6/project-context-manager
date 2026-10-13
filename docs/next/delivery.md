# Alpha 交付指南 · 3.0.0-alpha.2

最终本地包：project-context-manager-3.0.0-alpha.2-delivery-8b7a029f-b36a-470e-9dec-3cf08a146bbf.zip。

SHA256：49048f33e28a9931aef4d6e006b1d9c6f8d585e98f20b206f1b915b245a3f0a8。

2026-10-13 打包范围：9 项 ZIP、7 项内嵌 VSIX，实际字节与当前构建一致；解压 CLI 交接、只读恢复、缺少记录和漂移自检通过，篡改自检拒绝通过。见 [当前验证 JSON](delivery-verification-current.json)。

本次 Alpha 核心功能与演示验收 PASS，见 [交付报告及已知限制](alpha-delivery-2026-10-13.md)。单次规模采集慢、完整 GUI 高级验收与跨 Agent 等事项保留为 Known Limitations。历史交付包与记录保留，但当前包以上述文件为准。

解压包需要 Node.js >=22.12，Git 证据需要 Git；CLI 已 bundle，无需 npm install。

```sh
node verify.mjs
node bin/pcm.cjs status /path/to/project
node bin/pcm.cjs restore /path/to/project
```

VS Code 的扩展菜单选择“从 VSIX 安装”，使用包内 extensions/project-context-manager-3.0.0-alpha.2.vsix。无需自动授权 Agent。恢复退出码 2 表示语义待核实，应查看结果；哈希校验不是作者签名。

源码重建：npm run package:release。公开源码位于 GitHub 草稿 PR #1，未合并或发布 Marketplace；本地二进制交付包可下载，仓库许可仍 UNLICENSED。
