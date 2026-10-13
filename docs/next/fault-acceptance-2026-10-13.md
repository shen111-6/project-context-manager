# 故障恢复与取消验收（2026-10-13）

本次 Windows 当前代码执行，不继承旧结果。完整 npm test 最终 9 个文件、37 项测试通过（40.55 秒）；package:release 的 build、ZIP/VSIX 核对及解压 CLI 自检通过。

## 真实存储故障

新增 tests/fault-recovery.test.ts，在独立子进程中把本次实际索引 rename 边界作为退出点，进程确实退出码 77，而非只抛一个模拟业务异常。

- 索引提交前退出：上一个索引字节和旧快照保持完整，恢复读到 initial；已写但未提交的快照/临时索引不被认证为最新记录。
- 索引提交后退出：恢复读到已提交 candidate，旧不可变记录仍完整。
- 两种退出均留下写锁，新的发布明确拒绝 WRITE_CONFLICT，不自动窃取锁。测试确认子进程终止后，只在合成夹具中移除它的锁并重新 prepare；新发布成功，旧记录和原源码字节不变。没有为实际项目自动清锁。
- Windows 对合成 index.json 设置只读属性，实际替换失败；操作返回 failed、无成功产物，旧索引和快照不变。恢复可写后 fresh retry 成功。POSIX 测试改为禁止存储目录写入（只读文件不能阻止目录中的 rename）；以 root 运行 POSIX 时该权限测试明确跳过。当前只有 Windows 已执行，其他平台不宣称通过。

## 取消响应修复

非 Git 文件发现原来仅在 sample 外层及后续文件读取循环检查 AbortSignal，目录发现中取消仍可能继续遍历子项。现已在 walk 每次进入子项前检查信号。

独立进程中真实 readdir 返回根目录列表时触发 abort；之后 lstat 计数为 0，返回 CANCELLED。没有新增睡眠或计时阈值来使测试碰巧通过；只证明目录发现取消边界，不证明全部 OS I/O 能立即中断。

## Webview 宿主事件回归

新增三项 gui-host 测试：进行中的 prepare 接收到 cancel 后进入取消页，retry 使用新 AbortSignal 并恢复预览；publish 失败不显示成功，retry 重新 prepare 后可发布；预览后撤回工作区信任不调用 publish。

这些运行实际宿主消息处理代码，但使用 VS Code/engine 替身，不能计为原生 GUI 点击验收。真实 GUI 的权限拒绝、取消/重试仍待可操作窗口完成。桌面工具此前拒绝输入的状态保持单独记录。

## 当前交付

修复后的完整包：project-context-manager-3.0.0-alpha.2-delivery-5fdc90aa-a735-4fa4-bdb4-8926de9bc517.zip。
SHA256：b7805a48ec468444ac3cbe38978084761a4b9bd317b03addbbce26f0d684f164。
归档清单、内嵌当前 bundle/规则字节匹配与执行前篡改拒绝报告见 [当前交付验证](delivery-verification-current.json)。原 11:13 交付报告作为历史证据保留，不冒充修复后的 bundle。
