# health-check 兼容入口

旧调用 `$project-context-manager health-check` 直接路由到 [verify](verify.md)，先应用 [共享状态重建规则](state-reconstruction.md)。默认只读，报告后停止。

它不是第七模块，不保留独立事实判断逻辑。输出改为 Verified / Verified With Gaps / Drift Detected / Insufficient Evidence；不再生成 Good / Warning / Poor。旧消费者若依赖原健康等级文本，需要迁移至 verify 的一致性状态，不能机械一一映射。
