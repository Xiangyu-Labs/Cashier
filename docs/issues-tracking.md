# Cashier 项目问题追踪清单

> 本文件记录代码审查中发现的所有问题，按优先级和类别组织。修复后请在对应项前打勾 `[x]`。

---

## 🔴 P0 - 关键Bug（立即修复）

### 事务处理 Bug（数据不一致风险）

- [ ] **1. `db.transaction` 缺少 `await`** - `src/features/source-document/server/tasks/parse-source-document.ts:358`
  - 影响：事务可能在后台执行，函数在事务完成前返回，导致数据不一致
  - 修复：添加 `await db.transaction(async (tx) => { ... })`

- [ ] **2. `db.transaction` 缺少 `await`** - `src/features/source-document/server/actions/main.ts:177-194` (retrySourceDocumentAction)

- [ ] **3. `db.transaction` 缺少 `await`** - `src/features/source-document/server/actions/main.ts:251-274` (deleteSourceDocumentAction)

- [ ] **4. `db.transaction` 缺少 `await`** - `src/features/ledger/server/actions/categories.ts` 多处

- [ ] **5. `db.transaction` 缺少 `await`** - `src/features/ledger/server/actions/ledgers.ts` 多处

- [ ] **6. `db.transaction` 缺少 `await`** - `src/features/auth/server/services/user-setup.ts:18`

### 类型安全 Bug（运行时崩溃风险）

- [ ] **7. Session 类型不安全** - `src/auth.ts:137` `null as unknown as Session`
  - 风险：返回 null 但类型系统认为是 Session，可能导致调用方崩溃
  - 修复：返回 `null` 并修改返回类型为 `Session | null`，或抛出错误

### UI Bug

- [ ] **8. CSS 语法错误** - `src/features/ledger/components/settings/CategorySection.tsx:262`
  - 当前：`border(--border)]`
  - 应改为：`border-[var(--border)]`

---

## 🟠 P1 - 架构问题（本周修复）

### 代码重复

- [ ] **9. `parseJsonResponse` 函数重复** - `src/features/source-document/server/tasks/stage1-executor.ts:70-90`
- [ ] **10. `parseJsonResponse` 函数重复** - `src/features/source-document/server/tasks/stage1-5-validator.ts:35-49`
- [ ] **11. `parseJsonResponse` 函数重复** - `src/features/source-document/server/tasks/stage2-executor.ts:32-46`
  - 建议：提取到 `src/lib/ai/response-parser.ts`

- [ ] **12. 映射逻辑重复** - `src/features/ledger/server/services/ledgers.ts` 和 `actions/ledgers.ts` 都有 `mapLedgerToApi`
- [ ] **13. 序列化逻辑重复** - `services/categories.ts` 内联映射 vs `lib/serialization/utils.ts` 的 `serializeEntryCategory`

- [ ] **14. IP获取逻辑重复** - `src/features/auth/server/actions/auth.ts:34-36` 和 `services/otp.ts:144-146`
- [ ] **15. 邮箱规范化重复** - 多处使用 `email.toLowerCase().trim()`
- [ ] **16. 错误响应构造重复** - `src/features/auth/server/utils/helpers.ts` 多处
- [ ] **17. 倒计时逻辑重复** - `ResendCountdown` 和 `ExpiryTimer` 实现类似
- [ ] **18. 日期工具函数重复** - `AdaptiveHeatmap.tsx` 和 `YearView.tsx` 都定义了 `formatDate`
- [ ] **19. 分组逻辑重复** - `useSourceDocuments.ts` 和 `usePendingSourceDocuments.ts` 两种分组方式
- [ ] **20. 仲裁提示词构建重复** - `stage1-executor.ts:144-162` 和 `stage2-executor.ts:142-165`

### 文件/函数大小超标

- [ ] **21. `parse-source-document.ts` 419行** - 超过400行限制
- [ ] **22. `stage1-executor.ts` 309行** - 接近上限
- [ ] **23. `main.ts` 915行** - 严重超过400行限制，建议拆分：
  - `crud.ts` - 基础 CRUD
  - `batch.ts` - 批量操作
  - `query.ts` - 查询相关
  - `quick-entry.ts` - 快速录入

- [ ] **24. `TaskQueueModal.tsx` 427行** - 超过400行限制
- [ ] **25. `QueueItemCard.tsx` 332行** - 接近上限
- [ ] **26. `AdaptiveHeatmap.tsx` 402行** - 超过400行限制
- [ ] **27. `YearView.tsx` 316行** - 接近上限
- [ ] **28. `DetailsTab.tsx` 460行** - 超过400行限制
- [ ] **29. `LedgerEntriesTab.tsx` 449行** - 超过400行限制
- [ ] **30. `BatchActionToolbar.tsx` 469行** - 超过400行限制
- [ ] **31. `SettingsTab.tsx` 369行** - 接近上限
- [ ] **32. `LedgerManagementSection.tsx` 352行** - 接近上限
- [ ] **33. `LedgerPageClient.tsx` 356行** - 接近上限
- [ ] **34. `LedgerEntryViewDetails.tsx` 341行** - 接近上限
- [ ] **35. `heatmap.ts` 336行** - 接近上限

### 函数过长

- [ ] **36. `otp-repository.ts:219行`** - `verifyOTPToken` 函数110行，建议拆分
- [ ] **37. `execute` 函数 196行** - `parse-source-document.ts`
- [ ] **38. `onComplete` 函数 135行** - `parse-source-document.ts`
- [ ] **39. `runDualGptWithArbitration` 函数 83行** - `stage1-executor.ts`
- [ ] **40. `executeStage1` 函数 116行** - `stage1-executor.ts`
- [ ] **41. `executeStage2` 函数 96行** - `stage2-executor.ts`
- [ ] **42. `recalculateEntriesConvertedAmount` 函数 75行** - `ledgers.ts`
- [ ] **43. `submitCategorizeTasksForEntries` 函数 75行** - `categorize.ts`
- [ ] **44. `getSourceDocumentsAction` ~145行** - `main.ts`
- [ ] **45. `getAllSourceDocumentsAction` ~108行** - `main.ts`
- [ ] **46. `createQuickEntryAction` ~78行** - `main.ts`
- [ ] **47. `login/page.tsx` 254行** - 建议提取自定义hook

### 架构设计问题

- [ ] **48. 服务层未被使用** - `src/features/ledger/server/services/` 定义的函数未被 Actions 调用
  - 建议：让 Actions 调用 Services，或移除 Services 层

- [ ] **49. Repository 模式使用不一致** - `registration.ts` 和 `user-setup.ts` 直接操作数据库
- [ ] **50. otp-repository.ts 包含业务逻辑** - `verifyOTPToken` 包含尝试次数限制、锁定策略（应在 Service 层）
- [ ] **51. 目录边界不清晰** - `dismiss-task.ts` 在 `tasks` 目录，`cancel-task.ts` 在 `task-queue` 目录
- [ ] **52. 循环依赖风险** - `ledger/server/schema.ts` 导入 `sourceDocuments`
- [ ] **53. 缺少 Repository 抽象层** - `registration.ts` 和 `user-setup.ts` 直接操作 users 表

### 安全相关问题

- [ ] **54. IP 地址获取不安全** - 依赖 `X-Forwarded-For` 可被客户端伪造
  - 建议：使用 `X-Real-IP` 或配置受信任代理

- [ ] **55. 错误信息可能泄露信息** - `verifyOTPAction` 区分 "not_found"、"expired"、"locked" 等错误类型
- [ ] **56. UUID 验证不严格** - 正则表达式不验证 UUID 版本
- [ ] **57. 缺少输入长度限制** - `sendOTPAction` 没有限制 email 长度（DoS 风险）
- [ ] **58. 邮件预览显示 OTP 明文** - `otp-email.tsx` 预览会显示 OTP

---

## 🟡 P2 - 类型安全问题

### 类型断言（as）

- [ ] **59. `as Record<string, unknown>`** - `src/features/ledger/server/actions/entries.ts:96`
- [ ] **60. `as Record<string, unknown>`** - `src/features/ledger/server/actions/entries.ts:183`
- [ ] **61. `as Record<string, number>`** - `src/features/ledger/server/actions/stats.ts:135`
- [ ] **62. 隐式 any** - `src/features/ledger/server/actions/credentials.ts:27` map函数
- [ ] **63. `as LedgerEntry`** - `src/features/ledger/client/hooks/useEntryMutations.ts:66`
- [ ] **64. `as LedgerEntry`** - `src/features/ledger/client/hooks/useEntryMutations.ts:83`
- [ ] **65. 内联类型断言** - `src/features/ledger/client/hooks/useLedgerEntriesMutations.ts` 多处
- [ ] **66. `as Partial<SourceDocument>`** - `src/features/source-document/server/actions/main.ts:557`
- [ ] **67. `as SerializedSourceDocument`** - `src/features/source-document/server/actions/main.ts:606`
- [ ] **68. tokenUsage as {...}** - `src/features/source-document/server/actions/processing.ts:62`
- [ ] **69. input as unknown** - `src/features/task-queue/server/actions/task-queue.ts:37`
- [ ] **70. status as QueueItemStatus** - `src/features/task-queue/server/actions/task-queue.ts:54`
- [ ] **71. tokenUsage as {...}** - `src/features/task-queue/server/actions/task-queue.ts:161-164`
- [ ] **72-75. `level as 0|1|2|3|4|5`** - Calendar 组件多处
- [ ] **76. credentials.email as string** - `src/features/auth/server/actions/auth.ts:35`
- [ ] **77. credentials.otp as string** - `src/features/auth/server/actions/auth.ts:36`
- [ ] **78-79. `as unknown as Record<string, SQL>`** - `src/lib/db/scoped-query.ts:16-17,32-33`
- [ ] **80. error as Error** - `src/lib/flow/engine.ts:186`
  - 建议：使用 `error instanceof Error ? error : new Error(String(error))`

- [ ] **81-84. as 类型断言** - `src/lib/flow/ai-context.ts:28,30,31,32`
- [ ] **85. status as TaskRecord['status']** - `src/lib/flow/adapters/drizzle-storage.ts:124`
- [ ] **86. tokenUsage as TokenUsageRecord** - `src/lib/flow/adapters/drizzle-storage.ts:128`
- [ ] **87-88. metadata as Record<string, unknown>** - `src/lib/serialization/utils.ts:140,163`
- [ ] **89. status as SerializedTask["status"]** - `src/lib/serialization/utils.ts:183`
- [ ] **90. undefined as TContext** - `src/lib/mutations/use-ledger-mutation.ts:140`
- [ ] **91. as any** - `editable-field.tsx:152`

---

## 🔵 P3 - 测试覆盖缺失

### 核心基础设施测试

- [ ] **92. AI 服务层测试缺失**
- [ ] **93. 账本 Services 无直接测试**
- [ ] **94. 账本 Client Hooks 测试缺失** - 8/9 个 hooks 无测试
- [ ] **95. 账本 Components 测试缺失** - 20/22 个组件无测试
- [ ] **96. 源文档 Actions 测试缺失** - `createQuickEntryAction` 等
- [ ] **97. 源文档 Client Hooks 测试缺失** - 3 个 hooks 均无测试
- [ ] **98. 任务队列 cancel-task.ts 无测试**
- [ ] **99. 任务队列 Client hooks 无测试**
- [ ] **100. Tasks 模块测试缺失**
- [ ] **101. Calendar date-utils 无单元测试**
- [ ] **102. Calendar 组件无测试** - `HeatmapCell`, `MonthView`, `YearView`, `AdaptiveHeatmap`

### 认证测试

- [ ] **103. 认证 Actions 无直接测试** - `sendOTPAction`, `verifyOTPAction`
- [ ] **104. account.ts 无测试** - 涉及账户删除
- [ ] **105. notifications.ts 无测试** - 邮件发送

### 基础设施测试

- [ ] **106. 数据库 scoped-query.ts 无单元测试**
- [ ] **107. Flow ai-context.ts 无直接测试**
- [ ] **108. Flow json-utils.ts 无直接测试**
- [ ] **109. Modal store 无测试**

### Hooks 测试

- [ ] **110. useSmartPolling 无测试**
- [ ] **111. useInfiniteScroll 无测试**
- [ ] **112. useReducedMotion 无测试**

### 组件测试

- [ ] **113. otp-input.tsx 无测试**
- [ ] **114. calculator-input.tsx 无测试**
- [ ] **115. editable-field.tsx 无测试**
- [ ] **116. pull-to-refresh.tsx 无测试**
- [ ] **117. image-viewer.tsx 无测试**

---

## 🟣 P4 - 代码规范问题

### Immutability 违规

- [ ] **118. setDate 修改 Date 对象** - `src/features/calendar/lib/date-utils.ts:47-48`
- [ ] **119. setDate 修改 Date 对象** - `src/features/calendar/lib/date-utils.ts:103-104`
- [ ] **120. setDate 修改 Date 对象** - `src/features/calendar/components/YearView.tsx:68-69`
- [ ] **121. 命令式编程风格** - `user-setup.ts` 使用 `let` 和闭包赋值
- [ ] **122. 可变状态累积** - `processing.ts` 使用 `for` 循环累加而不是 `reduce`

### UI/UX 问题

- [ ] **123. 空成功消息** - `useBatchEntryActions.ts` `successMessage: ""` 会显示空 toast
- [ ] **124. 不一致的快照模式** - `useLedgerSettings.ts` 使用 `getQueriesData` 而非 `createListSnapshots`
- [ ] **125. 查询优化问题** - `task-queue.ts` 查询 100 条但只使用 5 条
- [ ] **126. 软删除过滤缺失** - `drizzle-storage.ts` list 方法没有过滤软删除记录
- [ ] **127. 重复类型定义** - `AdaptiveHeatmap.tsx` `LargeGridHeatmapProps` 被定义两次
- [ ] **128. 拼写不一致** - `cleanupExpiredOTPTokens` vs `deleteOTPToken`
- [ ] **129. 变量命名过于简短** - `scoped-query.ts` 使用 `t` 而非 `tableColumns`

### 魔法数字和硬编码

- [ ] **130. 魔术数字** - `login/page.tsx` `otp.length !== 6`
- [ ] **131. 魔术数字** - `otp.ts` 多处硬编码数字
- [ ] **132. 硬编码时区** - `notifications.ts` "Asia/Shanghai"
- [ ] **133. 硬编码限制** - `task-queue.ts` limit: 100 和 slice(0, 5)

### 其他规范问题

- [ ] **134. 未使用的参数** - `auth.ts` `_locale: string = "en"`
- [ ] **135. 未使用的变量** - `QueueItemCard.tsx` `_tEntries`
- [ ] **136. 导入顺序不一致** - 部分文件导入顺序不一致
- [ ] **137. 引号风格不一致** - `YearView.tsx` 使用单引号，其他文件使用双引号
- [ ] **138. 注释不足** - 复杂逻辑缺少注释说明
- [ ] **139. setTimeout 模式 questionable** - `SourceDocumentPreview.tsx` 延迟状态更新

---

## 🟤 P5 - 功能缺失/不完善

### 进度和取消处理

- [ ] **140. 缺少进度报告** - `generate-category-metadata.ts` 没有调用 `updateProgress`
- [ ] **141. 进度报告缺失** - `categorize-entry.ts` 没有进度报告
- [ ] **142. 取消信号处理缺失** - `generate-category-metadata.ts` 没有检查 `signal.aborted`
- [ ] **143. 事务缺失** - `categorize-entry.ts` onComplete 没有使用事务
- [ ] **144. 事务缺失** - `generate-category-metadata.ts` onComplete 没有使用事务

---

## ⚫ P6 - 可访问性和性能

### 可访问性

- [ ] **145. 计算器按钮缺少 aria-label** - `calculator-input.tsx`
- [ ] **146. 下拉刷新缺少屏幕阅读器通知** - `pull-to-refresh.tsx`

### 性能优化

- [ ] **147. useCallback 缺失** - `image-viewer.tsx` 每次渲染创建新函数
- [ ] **148. Memoization 优化** - `CategoryIcon` 可以添加 memo
- [ ] **149. 大数据集性能** - `YearView.tsx` 每次渲染计算 371 个单元格
- [ ] **150. 内存存储清理** - `otp-rate-limit.ts` 没有自动清理过期 key 的机制
- [ ] **151. 递归风险注释不足** - `ai-context.ts` JSON 修复逻辑

---

## 📊 进度统计

| 优先级 | 总数 | 已修复 | 进度 |
|--------|------|--------|------|
| P0 关键Bug | 8 | 0 | 0% |
| P1 架构问题 | 45 | 0 | 0% |
| P2 类型安全 | 33 | 0 | 0% |
| P3 测试覆盖 | 26 | 0 | 0% |
| P4 代码规范 | 22 | 0 | 0% |
| P5 功能缺失 | 5 | 0 | 0% |
| P6 可访问性/性能 | 7 | 0 | 0% |
| **总计** | **146** | **0** | **0%** |

---

## 📝 修复记录

### 批次 1 - 关键 Bug 修复 (P0)

| 问题编号 | 文件路径 | 修复内容 | 修复人 | 日期 |
|---------|---------|---------|--------|------|
| | | | | |

### 批次 2 - 代码重复清理 (P1)

| 问题编号 | 文件路径 | 修复内容 | 修复人 | 日期 |
|---------|---------|---------|--------|------|
| | | | | |

### 批次 3 - 文件拆分 (P1)

| 问题编号 | 文件路径 | 修复内容 | 修复人 | 日期 |
|---------|---------|---------|--------|------|
| | | | | |

### 批次 4 - 类型安全修复 (P2)

| 问题编号 | 文件路径 | 修复内容 | 修复人 | 日期 |
|---------|---------|---------|--------|------|
| | | | | |

### 批次 5 - 测试添加 (P3)

| 问题编号 | 文件路径 | 修复内容 | 修复人 | 日期 |
|---------|---------|---------|--------|------|
| | | | | |

---

*最后更新: 2026-03-05*
*创建: Claude Code*
