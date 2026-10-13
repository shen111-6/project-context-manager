# 本地完整交付包

项目根目录运行 `npm run package:release`：先构建、生成 VSIX，再限定内容打 ZIP，检查归档并解压验证，只有检查通过的文件才从 .pending 改名为最终 .zip。输出在现有项目外层 ../../outputs，每次使用独立文件名，并旁存 .verification.json。

包内有独立运行的 bin/pcm.cjs、VSIX、协议 Schema、第三方许可、README、项目概览、离线演示概要、manifest.json 和 verify.mjs。没有打包源码、Git 元数据、工作区依赖、真实项目交接记录或个人简历文件。CLI 已 bundle，解压后使用系统 Node，无需 npm install。

```sh
npm run package:release
# 解压得到的交付包中：
node verify.mjs
node bin/pcm.cjs status /path/to/project
node bin/pcm.cjs restore /path/to/project
```

本次成功产物：project-context-manager-3.0.0-alpha.2-delivery-18f3330e-c215-43b6-a6e0-ee7c645fb918.zip。

SHA256：81553cfd11e8b552142920d008c0323f0766a5165809b6af137f9454b5bb3c0a。

2026-10-13 Windows 实际检查：9 个 ZIP 条目与打包输入逐字节一致；包内 VSIX 严格 7 个条目，版本匹配，扩展 bundle 和规则资源等于当前构建。解压后的 CLI 在独立临时合成项目运行缺少记录、交接、只读恢复、漂移四个场景，符合退出码和证据判断。恢复前后源码与交接记录字节不变。另修改解压副本 CLI 字节，自检在执行 CLI 前因哈希不符拒绝，原构建未改动。详情见 [实际验证结果](delivery-verification-2026-10-13.json)。

manifest 校验的是内容一致性，不是发布者身份或签名；需要从可信来源取得包。自检仅在其创建的临时夹具中运行和清理，不调用 Agent，不安装扩展。历史演示证据保持原始日期，不冒充当前产品效果研究。

这是本地 alpha 交付，尚未自动发布。完整产品验收仍按 [收尾清单](completion.md) 推进，OS 权限、运行中 GUI 取消重试及跨平台等缺口不因打包完成变成通过。代码源码和依赖锁仍在项目工作区维护。

当前源码随后修复取消响应，已重新构建交付。最新包与 SHA256、实际检查见 [故障验收及当前交付](fault-acceptance-2026-10-13.md)，上文包是该修复前的历史交付。
