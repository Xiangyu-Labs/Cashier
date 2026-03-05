# Cashier 项目问题追踪清单

> 本文件记录代码审查中发现的所有问题，按优先级和类别组织。修复后请在对应项前打勾 `[x]`。

---

## 🔴 P0 - 关键Bug（立即修复）

### 事务处理 Bug（数据不一致风险）

- [x] **1-6. `db.transaction` 缺少 `await`** - 6 个文件
  - **状态：误报（False Positive）** - 2026-03-05 验证
  - 原因：`better-sqlite3` 使用**同步事务**，不需要 `await`
  - 验证：所有相关测试通过（`npx vitest run tests/integration/api/`）
  - 结论：原代码正确，无需修复

### 类型安全 Bug（运行时崩溃风险）

- [x] **7. Session 类型不安全** - `src/auth.ts:137` `null as unknown as Session` ✅ 已修复
  - 修复：抛出错误 `throw new Error("User not found in database")`，使用 immutable spread 模式返回新对象
  - 提交：`0d2a602`

### UI Bug

- [x] **8. CSS 语法错误** - `src/features/ledger/components/settings/CategorySection.tsx:262` ✅ 已修复
  - 修复：`border(--border)]` → `border-[var(--border)]`
  - 提交：`0d2a602`

---

## 🟠 P1 - 架构问题（本周修复）

### 代码重复

- [x] **9. `parseJsonResponse` 函数重复** - `src/features/source-document/server/tasks/stage1-executor.ts:70-90` ✅ 已修复
- [x] **10. `parseJsonResponse` 函数重复** - `src/features/source-document/server/tasks/stage1-5-validator.ts:35-49` ✅ 已修复
- [x] **11. `parseJsonResponse` 函数重复** - `src/features/source-document/server/tasks/stage2-executor.ts:32-46` ✅ 已修复
  - 修复：提取到 `src/lib/ai/response-parser.ts`，三个文件统一导入使用

- [x] **12. 映射逻辑重复** - `src/features/ledger/server/services/ledgers.ts` 和 `actions/ledgers.ts` 都有 `mapLedgerToApi` ✅ 已修复
  - 修复：`services/ledgers.ts` 现在导入并使用 `serializeLedger` 替代 `mapLedgerToApi`
  - 删除了 `mapLedgerToApi` 函数

- [x] **13. 序列化逻辑重复** - `services/categories.ts` 内联映射 vs `lib/serialization/utils.ts` 的 `serializeEntryCategory` ✅ 已修复
  - 修复：`services/categories.ts` 现在导入并使用 `serializeEntryCategory`
  - 使用 spread 模式添加 `entryCount` 字段

- [x] **14. IP获取逻辑重复** - `src/features/auth/server/actions/auth.ts:34-36` 和 `auth.ts:144-146` ✅ 已修复
  - 修复：提取到 `src/lib/utils/ip.ts`，两处改为导入使用
- [x] **15. 邮箱规范化重复** - 多处使用 `email.toLowerCase().trim()` ✅ 已修复
  - 修复：提取到 `src/lib/utils/email.ts`，auth.ts 两处改为导入使用
- [x] **16. 错误响应构造重复** - `src/features/auth/server/utils/helpers.ts` 多处 ✅ 已修复
  - 修复：提取 `createErrorResponse`, `unauthorized()`, `notFound()` 辅助函数
  - 减少重复代码 ~30 行

- [ ] **17. 倒计时逻辑重复** - `ResendCountdown` 和 `ExpiryTimer` 实现类似
- [x] **18. 日期工具函数重复** - `AdaptiveHeatmap.tsx` 和 `YearView.tsx` 都定义了 `formatDate` ✅ 已修复
  - 已提取到 `src/features/calendar/lib/date-utils.ts`

- [x] **19. 分组逻辑重复** - `useSourceDocuments.ts` 和 `queries.ts` 两种分组方式 ✅ 已修复
  - 修复：创建共享的 `src/features/source-document/lib/grouping.ts`
  - 提供 `groupSourceDocumentsByStatus`, `groupPendingSourceDocuments`, `calculateSourceDocumentStats` 函数
  - 服务器端和客户端统一使用

- [x] **20. 仲裁提示词构建重复** - `stage1-executor.ts:144-162` 和 `stage2-executor.ts:142-165` ✅ 已修复
  - 已提取到 `lib/ai/dual-gpt-runner.ts`

### 文件/函数大小超标

- [x] **21. `parse-source-document.ts` 419行** - 超过400行限制 ✅ 已修复
  - 拆分结果：
    - `entry-builder.ts` - 条目构建与货币转换 (100行)
    - `parse-result-handler.ts` - 结果处理器 (100行)
    - `parse-source-document.ts` - 主执行器 (145行)

- [x] **22. `stage1-executor.ts` 309行** - 接近上限 ✅ 已修复
  - 拆分结果：
    - `lib/ai/dual-gpt-runner.ts` - 可复用的双GPT运行器 (85行)
    - `schemas.ts` - Zod校验模式 (35行)
    - `stage1-executor.ts` - 主执行器 (120行)
- [x] **23. `main.ts` 915行** - 严重超过400行限制 ✅ 已修复
  - 拆分结果：
    - `types.ts` - 类型定义 (83行)
    - `helpers.ts` - 任务准备工具 (46行)
    - `create.ts` - 创建单据 (40行)
    - `retry.ts` - 重试单据 (84行)
    - `update.ts` - 更新单据 (42行)
    - `delete.ts` - 删除单据 (96行)
    - `batch-retry.ts` - 批量重试 (74行)
    - `queries.ts` - 查询操作 (246行)
    - `quick-entry.ts` - 快速录入 (79行)
    - `index.ts` - 统一导出 (36行)

- [x] **24. `TaskQueueModal.tsx` 427行** - 超过400行限制 ✅ 已修复
  - 拆分结果：
    - `hooks/useTaskQueueModal.ts` - 状态管理和逻辑 (180行)
    - `components/TaskQueueContent.tsx` - 内容渲染 (215行)
    - `components/TaskQueueDialogs.tsx` - 对话框管理 (35行)
    - `TaskQueueModal.tsx` - 主组件协调 (75行)
- [x] **25. `QueueItemCard.tsx` 332行** - 接近上限 ✅ 已修复
  - 拆分结果：`QueueItemCard/index.tsx` (264行), `StatusIcon.tsx`, `useQueueItemActions.ts`, `constants.ts`
- [x] **26. `AdaptiveHeatmap.tsx` 402行** - 超过400行限制 ✅ 已修复
  - 拆分结果：`AdaptiveHeatmap/index.tsx` (156行), `LargeGrid.tsx`, `SmallGrid.tsx`, `DayCellLarge.tsx`, `DayCellSmall.tsx`
- [x] **27. `YearView.tsx` 316行** - 接近上限 ✅ 已修复
  - 拆分结果：`YearView/index.tsx` (139行), `DayCell.tsx`, `useYearData.ts`
- [x] **28. `DetailsTab.tsx` 460行** - 超过400行限制 ✅ 已修复
  - 拆分结果：
    - `hooks/useDetailsTabState.ts` - 状态和弹窗管理 (50行)
    - `hooks/useDetailsTabData.ts` - 数据获取 (110行)
    - `hooks/useDetailsTabGrouping.ts` - 按日期分组 (60行)
    - `hooks/useDetailsTabFilters.ts` - 过滤器逻辑 (75行)
    - `DetailsTab.tsx` - 主组件协调 (165行)
- [x] **29. `LedgerEntriesTab.tsx` 449行** - 超过400行限制 ✅ 已修复
  - 拆分结果：`LedgerEntriesTab/index.tsx` (379行), `useGroupedEntries.ts`
- [x] **30. `BatchActionToolbar.tsx` 469行** - 超过400行限制 ✅ 已修复
  - 拆分结果：`BatchActionToolbar/index.tsx` (238行), `LedgerEntriesActions.tsx`, `SourceDocumentActions.tsx`, `useBatchActions.ts`
- [x] **31. `SettingsTab.tsx` 369行** - 接近上限 ✅ 已修复
  - 拆分结果：`SettingsTab.tsx` (309行), `settings/CollapsibleSection.tsx`
- [x] **32. `LedgerManagementSection.tsx` 352行** - 接近上限 ✅ 已修复
  - 拆分结果：`LedgerManagementSection/index.tsx` (238行), `useLedgerMutations.ts`, `CreateLedgerDialog.tsx`
- [x] **33. `LedgerPageClient.tsx` 356行** - 接近上限 ✅ 已修复
  - 拆分结果：`LedgerPageClient/index.tsx` (223行), `useLedgerTabs.ts`, `useDrilldownNavigation.ts`, `Header.tsx`
- [x] **34. `LedgerEntryViewDetails.tsx` 341行** - 接近上限 ✅ 已修复
  - 拆分结果：`LedgerEntryViewDetails/index.tsx` (222行), `EntryHeader.tsx`, `EntryActions.tsx`, `useTextFolding.ts`
- [x] **35. `heatmap.ts` 336行** - 接近上限 ✅ 已修复
  - 拆分结果：`heatmap/index.ts`, `getHeatmapData.ts`, `getDayDetail.ts`, `getHeatmapForRange.ts`, `schemas.ts`, `utils.ts`

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
| P0 关键Bug | 8 | 2 | 25% |
| P1 架构问题 | 45 | 0 | 0% |
| P2 类型安全 | 33 | 0 | 0% |
| P3 测试覆盖 | 26 | 0 | 0% |
| P4 代码规范 | 22 | 0 | 0% |
| P5 功能缺失 | 5 | 0 | 0% |
| P6 可访问性/性能 | 7 | 0 | 0% |
| **总计** | **146** | **2** | **1.4%** |

**说明：**
- P0 中 6 个事务问题被标记为**误报**（better-sqlite3 同步事务不需要 await）
- 实际修复：Session 类型安全、CSS 语法错误

---

## 📝 修复记录

### 批次 1 - 关键 Bug 修复 (P0)

| 问题编号 | 文件路径 | 修复内容 | 修复人 | 日期 |
|---------|---------|---------|--------|------|
| 1-6 | 6个文件 | db.transaction await 问题 | 无需修复 | 2026-03-05 |
| | | - 验证为误报（better-sqlite3同步事务） | | |
| 7 | src/auth.ts | 移除 `null as unknown as Session`，使用 immutable spread | Claude | 2026-03-05 |
| 8 | CategorySection.tsx | 修复 CSS 语法 `border(--border)]` → `border-[var(--border)]` | Claude | 2026-03-05 |

**提交**: `0d2a602` fix: P0 critical bugs - session type safety and CSS syntax

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
*P0 修复完成: 2026-03-05*
*创建: Claude Code*
