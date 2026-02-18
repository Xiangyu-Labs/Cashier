# Cashier 项目技术演进分析与个人开发偏好框架

> 基于 600 次 Git 提交（2026-01-25 ~ 2026-02-11）的完整分析。
> 本文档可跨项目复用，作为技术决策和代码风格的参考基准。

## 一、项目概况

- 时间跨度：2026-01-25 ~ 2026-02-11（18 天）
- 提交总数：600 commits
- 技术栈最终态：Next.js 16 (App Router) + TypeScript + SQLite/Drizzle ORM + TanStack Query + OpenAI

---

## 二、重大架构决策演进（按时间线）

### Phase 1: MVP 快速搭建（Batch 1-5, Jan 25-26）
- 初始 MVP：Gemini API + PostgreSQL + 同步处理
- 快速迁移 Gemini → OpenAI（仅第 2 批就完成）
- 引入异步消息队列处理
- 建立 Tab 导航结构（history/verify/stats/record → 后来精简为 3 个）

### Phase 2: 领域模型重塑（Batch 12-13, Jan 28）
- Transaction → LedgerEntry
- Receipt/InputMessage → SourceDocument
- categories → entry-categories
- GPT tasks → processing tasks

这次重命名不是简单的 find-replace，而是重新定义了领域语言。宁可花大力气重命名，也不用不精确的术语。

### Phase 3: 任务引擎三次重写（Batch 10→17→42）
1. **GPT Task System**（Batch 10）：自建简单任务管理 + 数据库状态追踪
2. **Flow + BullMQ**（Batch 17）：引入 Redis + BullMQ 做任务队列，34 文件 1075+/803-
3. **In-process TaskRunner**（Batch 42）：移除 Redis/BullMQ，改为进程内 Promise 执行

最终选择：**最简单的方案**。Redis/BullMQ 对单用户记账应用来说是过度工程化。

### Phase 4: 实时更新策略三次迭代（Batch 19→39→51）
1. **SSE + EventBus**（Batch 19）：服务端推送事件，客户端通过 EventSource 监听
2. **Smart Polling + Push Notifications**（Batch 39）：轮询替代 SSE
3. **TanStack Query staleTime + invalidation**（Batch 51+）：纯客户端缓存策略

最终选择：**不需要实时推送**，staleTime=5min + mutation 后 invalidate 就够了。

### Phase 5: 数据库从 PostgreSQL 迁移到 SQLite（Batch 42-43）
- 同时移除了 push notifications（依赖 PostgreSQL 特性）
- 移除了 sessions 表（JWT 替代数据库 session）
- Docker 镜像从 alpine 换成 slim（SQLite 需要 glibc）
### Phase 6: API 层从 Route Handlers 迁移到 Server Actions（Batch 30-31）
- 28 文件 1664+/1886-，几乎重写了整个 API 层
- 删除了 `src/lib/api.ts` 客户端 API helper 和 `ApiError` 类
- Server Actions 直接 throw error，不用 `{ success, error }` 包装

### Phase 7: Feature-based 目录重构（Batch 32-33）
- 从 `src/lib/` 平铺结构迁移到 `src/features/{domain}/` 模块化结构
- 每个 feature 包含 `server/`（actions, services, schema）、`components/`、`client/hooks/`
- 连续 8 个提交完成迁移，有计划的大规模重构

### Phase 8: 组件分解大重构 Phase 0-7（Batch 58-59, Feb 10）
- SettingsTab: 633→349 行，提取 useCategoryMutations, useCredentialMutations, useLedgerSettings
- LedgerEntriesTab: 620→355 行，提取 useLedgerEntriesMutations, usePeriodFilter
- DetailsTab: 642→427 行，提取 focused hooks
- TaskQueueModal: 608→414 行
- 创建了 `useLedgerMutation` 通用 mutation factory，统一 cancel/snapshot/rollback/invalidate 生命周期
- 修复了 render-path side effects（toast.error 移到 useEffect）
- 统一 invalidateQueries 从 onSuccess 移到 onSettled

---

## 三、被移除的功能及原因分析

| 功能 | 引入 | 移除 | 推断原因 |
|------|------|------|----------|
| 语音录入 | Batch 1 | Batch 1 | 交互不自然，图片粘贴更实用 |
| Gemini API | Batch 1 | Batch 2 | OpenAI 效果更好/更稳定 |
| 合并相似条目 | Batch 9 | Batch 39 | AI 合并不可控，拆分更可预测 |
| 自动确认流程 | Batch 7 | Batch 20 | 增加了不必要的用户操作步骤 |
| 公开分享 | Batch 23 | Batch 35 | 功能优先级低，增加安全风险 |
| 推送通知 | Batch 35 | Batch 42 | 迁移 SQLite 后不再需要 |
| 暗色主题 | Batch 6 | Batch 53 | 维护成本高，非核心功能 |
| AI 条目摘要 | Batch 17 | Batch 41 | 额外 API 调用，价值不大 |
| Repository 模式 | Batch 19 | Batch 38 | 对 Drizzle ORM 来说是多余的抽象层 |
| SSE 实时推送 | Batch 19 | Batch 38 | 轮询足够，SSE 增加复杂度 |
| Redis/BullMQ | Batch 17 | Batch 42 | 单用户场景过度工程化 |
| React Query 持久化 | Batch 46 | Batch 58 | 缓存一致性问题多于收益 |
| Next.js unstable_cache | Batch 46 | Batch 50 | 不稳定 API，TanStack Query 更可控 |
| Suspense wrappers | Batch 59 | Batch 60 | 渲染问题多于收益 |
| 移动端浮动按钮 | Batch 55 | Batch 55 | 统一桌面/移动端交互 |
| PendingBillsModal | Batch 47 | Batch 53 | 被 TaskQueue 统一替代 |

---

## 四、反复投入精力的领域（高优先级偏好）

### 4.1 时区处理（5 次修复，跨 3 个批次）
这是花费最多精力反复修复的问题：
1. `formatDateTimeForApi` 避免 `toISOString()` 的 UTC 转换
2. 用 `date-fns` 重构日期解析
3. **将 entryDate 从 timestamp 改为 yyyy-MM-dd 字符串**（根本性解决）
4. 配置 next-intl timezone 修复 SSR hydration
5. 全面修复：客户端发送 entryDate + timezone，服务端不再假设时区

**核心教训**：日期存储用纯字符串 `yyyy-MM-dd`，不用 timestamp。前端负责时区，后端只做字符串比较。

### 4.2 乐观更新模式（贯穿整个项目）
从早期的手动 setState → SSE 驱动 → 最终形成标准化模式：
- `useLedgerMutation` factory：统一 cancel → snapshot → optimistic → rollback → invalidate
- invalidateQueries 必须在 `onSettled`（不是 `onSuccess`），确保错误时也刷新
- `invalidateLedgerCache(ledgerId)` predicate：按 ledgerId 批量失效
- staleTime=5min，refetchOnMount="always" 但不阻塞渲染

### 4.3 i18n 路由（4 次重构）
1. 添加 `[locale]` 路由段
2. 移除 locale prefix（隐藏）
3. 再次移除 `[locale]` 段
4. 重新添加 `[locale]` 段 + localePrefix='always'

最终选择：`[locale]` 段 + `localePrefix='always'`。尝试了"隐藏 locale"的方案但发现问题更多。

### 4.4 错误状态建模（4 次迭代）
1. `failed` + `invalid` 两个状态
2. `error` + `errorCode` 字段
3. `anomalyCodes[]` 数组
4. `anomalyReason` 单字符串

从复杂到简单的演进。最终一个字符串就够了。

### 4.5 组件大小控制
Phase 4a-4d 专门把 600+ 行的组件拆到 350-430 行，提取自定义 hooks。
舒适区是 **单文件 300-400 行**，超过就需要拆分。

### 4.6 Payload 优化（Batch 47, 连续 4 个提交）
- 剥离 `aiRawResponse`、`rawOcrText` 等大字段
- 列表视图不返回 `imageUrls`
- 根据 status 条件性包含字段

对**网络传输效率**很敏感。

---

## 五、技术偏好总结（可复用框架）

### 5.1 架构原则
| 原则 | 证据 | 优先级 |
|------|------|--------|
| **最小复杂度** | 移除 Redis/BullMQ/SSE/Repository，用最简单方案 | ★★★★★ |
| **概念准确性** | 花大量提交做领域重命名（Transaction→LedgerEntry 等） | ★★★★★ |
| **Server Actions > API Routes** | 完整迁移，删除 ApiError 类 | ★★★★ |
| **Feature-based 模块化** | 专门 8 个提交做目录重构 | ★★★★ |
| **直接 ORM > Repository 抽象** | 移除 BaseRepository，用 Drizzle 直接查询 | ★★★★ |
| **进程内 > 外部依赖** | 移除 Redis，用内存 store；移除 BullMQ，用 Promise | ★★★★ |

### 5.2 前端模式
| 模式 | 具体实现 | 优先级 |
|------|----------|--------|
| **TanStack Query 为核心** | 服务端 prefetch + 客户端 hydration + staleTime | ★★★★★ |
| **乐观更新标准化** | useLedgerMutation factory，onSettled 做 invalidation | ★★★★★ |
| **集中式 Query Keys** | `queryKeys` 工厂 + `invalidateLedgerCache` predicate | ★★★★★ |
| **Skeleton > Spinner** | 多处实现骨架屏加载 | ★★★★ |
| **组件 300-400 行上限** | Phase 4 专门拆分 | ★★★★ |
| **Hooks 提取业务逻辑** | useCategoryMutations, usePeriodFilter 等 | ★★★★ |
| **Zustand 仅用于轻量客户端状态** | modal stack 管理 | ★★★ |
| **Pull-to-refresh** | 移动端交互模式 | ★★★ |
| **Inline editing > Modal editing** | 简单字段用 EditableField | ★★★ |

### 5.3 后端模式
| 模式 | 具体实现 | 优先级 |
|------|----------|--------|
| **Server Actions throw errors** | 不用 `{ success, error }` 包装 | ★★★★★ |
| **Soft delete** | 所有主表都有 `deletedAt` | ★★★★★ |
| **Tenant isolation via scope** | `forLedger()` helper + `requireLedgerAccess()` | ★★★★★ |
| **日期存字符串 yyyy-MM-dd** | 避免时区问题 | ★★★★★ |
| **metadata JSONB 存设置** | 替代多个独立列 | ★★★★ |
| **SQL 级过滤 > 内存过滤** | 数据库索引 + 条件查询 | ★★★★ |
| **批量操作 > 逐条处理** | batch delete, batch categorize | ★★★★ |
| **Zod 验证在系统边界** | Server Actions 入口验证 | ★★★ |

### 5.4 AI 集成模式
| 模式 | 具体实现 | 优先级 |
|------|----------|--------|
| **多阶段管道** | Stage 1(预分析) → Stage 1.5(验证) → Stage 2(详细解析) | ★★★★★ |
| **双重解析+仲裁** | 两次并行 LLM 调用，不一致时第三次仲裁 | ★★★★ |
| **进度反馈** | progressMessage 显示当前解析步骤 | ★★★★ |
| **任务版本控制** | 防止异步操作的竞态条件 | ★★★★ |
| **Token 用量追踪** | 记录每次 API 调用的 input/output tokens | ★★★ |

### 5.5 测试偏好
| 模式 | 具体实现 | 优先级 |
|------|----------|--------|
| **集成测试 > 单元测试** | 业务逻辑用集成测试 | ★★★★ |
| **内存 SQLite** | 测试不依赖外部数据库 | ★★★★ |
| **fileParallelism: false** | 数据库一致性 | ★★★★ |
| **全局 mock** | `@/lib/db`, `@/auth`, `next-intl`, `next/cache` | ★★★ |

### 5.6 UI/UX 偏好
| 模式 | 具体实现 | 优先级 |
|------|----------|--------|
| **紧凑布局** | 多次调整 padding/spacing 使布局更紧凑 | ★★★★ |
| **响应式设计** | 小屏隐藏次要信息，专门的响应式提交 | ★★★★ |
| **Lucide React 图标** | 统一图标库 | ★★★ |
| **Sonner toast** | 从 shadcn/ui toast 迁移到 sonner | ★★★ |
| **统一桌面/移动端** | 移除移动端浮动按钮，统一交互 | ★★★ |

---

## 六、决策模式总结（可复用于新项目）

### 6.1 "先加后减"模式
开发风格是先快速实现功能，然后在使用中发现问题后果断移除。15 个被移除的功能说明不怕删代码。

### 6.2 "简化基础设施"倾向
PostgreSQL → SQLite, Redis+BullMQ → 内存 store, SSE → 轮询。对于个人/小团队项目，倾向于减少外部依赖。

### 6.3 "概念精确"驱动
多次大规模重命名（Transaction→LedgerEntry, Receipt→SourceDocument），代码中的命名应该精确反映业务概念。

### 6.4 "标准化模式"追求
当发现重复模式时（乐观更新、mutation 生命周期），投入时间创建统一的 factory/hook，而不是容忍 copy-paste。

### 6.5 "渐进式重构"
大重构分多个 Phase 执行（Phase 0-7），每个 Phase 有明确目标，而不是一次性大改。

---

## 七、新项目启动清单（基于以上偏好）

1. **技术选型**：Next.js App Router + TypeScript + SQLite/Drizzle + TanStack Query
2. **目录结构**：`src/features/{domain}/` 模块化，每个 feature 含 server/components/client
3. **API 层**：Server Actions，直接 throw error
4. **状态管理**：TanStack Query（服务端状态）+ Zustand（仅轻量客户端状态）
5. **日期处理**：存储用 `yyyy-MM-dd` 字符串，前端负责时区
6. **数据安全**：所有表加 `deletedAt`，所有查询加 tenant scope
7. **乐观更新**：统一 mutation factory，onSettled 做 invalidation
8. **Query Keys**：集中式工厂 + scope-based invalidation predicate
9. **组件规范**：单文件 300-400 行上限，超过提取 hooks
10. **测试**：内存 SQLite，集成测试优先，fileParallelism: false
11. **i18n**：next-intl + `[locale]` 路由段 + localePrefix='always'
12. **加载状态**：Skeleton，不用 Spinner

---

*分析基于 600 次提交，截止至 2026-02-11*
