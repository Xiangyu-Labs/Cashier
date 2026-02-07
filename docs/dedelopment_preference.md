# 开发偏好分析报告

基于 Cashier 项目 544 次提交的 Git 历史分析，提取开发者的个人偏好、架构决策模式和技术风格。

---

## 1. 架构与基础设施偏好

### 🔴 强偏好：嵌入式数据库优于外部服务

**证据链：**
- `04f449a`: docs: Update database from PostgreSQL to SQLite
- `010efa2`: feat: Simplify local development to use SQLite by default
- `3319448`: feat: Implement robust SQLite database setup and migration fallback
- `1d6ee06`: 移除推送通知功能并更新数据库迁移至 SQLite 兼容模式

**推测原因：**
- 降低部署复杂度（单进程部署，无需维护 PostgreSQL 服务）
- 减少运维依赖，适合个人项目/小团队规模
- 简化开发环境配置

---

### 🔴 强偏好：内存任务队列优于外部消息队列

**证据链：**
- `bdb704d`: refactor: Remove Redis and BullMQ configurations, replace with in-memory store
- `5b9ecc7`: feat: Replace Redis with an in-memory store for rate limiting and async task processing
- `0e76af4`: refactor: Remove BullMQ worker configurations as tasks now run asynchronously in-process

**推测原因：**
- 消除 Redis 依赖，简化部署架构
- 对于单实例应用，内存队列足够可靠
- 减少基础设施成本和复杂度

---

### 🔴 强偏好：Server Actions 优于 API Routes

**证据链：**
- `05b5408`: refactor: Update server actions to directly return data or throw errors
- `614a417`: 将 source document 创建和重试逻辑从 API 调用迁移到 Server Actions
- 项目中仅保留 `[...nextauth]` 和少量 v1 API routes

**推测原因：**
- 类型安全的端到端调用
- 减少样板代码（无需手动 fetch/serialize）
- 更好的 Next.js 集成和错误处理

---

## 2. 代码组织与模块化

### 🔴 强偏好：Feature-Based 目录结构

**证据链：**
- `src/features/` 下按领域划分：`ledger`、`source-document`、`ai`、`tasks`、`currency`、`auth`
- 每个 feature 包含完整的 `server/actions`、`server/services`、`server/schema.ts`、`components/`、`client/hooks`

**模式：**
```
src/features/{domain}/
├── server/
│   ├── actions/     # Server Actions
│   ├── services/    # 业务逻辑
│   └── schema.ts    # Drizzle 表定义
├── components/      # 领域专属 UI
└── client/hooks/    # 客户端状态 hooks
```

---

### 🔴 强偏好：共享 UI 与领域 UI 分离

**证据链：**
- `src/components/ui/` 存放 Shadcn/ui 风格的底层原语（Button、Input、Dialog）
- 业务组件如 `IconPicker`、`EditableField` 放在对应 feature 目录下
- `d88a888`: Add IconPicker component and refactor CategorySection

---

## 3. API 设计与错误处理

### 🔴 强偏好：直接抛错优于 Result 包装对象

**证据链：**
- `05b5408`: refactor: Update server actions to directly return data or throw errors instead of result objects
- 该提交删除了 1000 行代码，添加了 609 行，净减少 ~400 行

**演进证据：**
```typescript
// 之前
export async function createLedgerEntryAction(...) {
    try {
        if (error) return { success: false, error: "Unauthorized" };
        // ...
        return { success: true, data: entry };
    } catch (error) {
        return { success: false, error: "Failed to create" };
    }
}

// 之后
export async function createLedgerEntryAction(...): Promise<LedgerEntry> {
    if (error) throw new Error("Unauthorized: Access to ledger denied");
    // ...
    return entry;
}
```

**推测原因：**
- 调用方代码更简洁（无需解构 success）
- 错误可被 Error Boundary 自动捕获
- TypeScript 类型推断更友好（返回类型直接是数据类型）

---

### 🔴 强偏好：IDOR 防护与信息泄露防护

**证据链：**
- `989261f`: enhance security by preventing IDOR
- 使用 `requireLedgerAccess` 工具函数验证访问权限
- 资源不存在或无权限时返回 `null` 而非抛出特定错误

**模式：**
```typescript
const { error } = await requireLedgerAccess(ledgerId);
if (error) throw new Error("Unauthorized");

// 查询时包含 ledgerId 条件，防止越权访问
const _q = forLedger(ledgerEntries, ledgerId);
```

---

## 4. 状态管理与数据流

### 🔴 强偏好：TanStack Query 管理服务端状态

**证据链：**
- 广泛使用 `useQuery`、`useMutation`
- 细粒度的 query key 失效：`queryKeys.taskQueue`、`queryKeys.uncategorizedCount`
- `cd70cb1`: 移除 `unstable_cache` 转向 TanStack Query 统一管理

---

### 🔴 强偏好：React `cache` 优于 `unstable_cache`

**证据链：**
- `cd70cb1`: refactor: Removed Next.js `unstable_cache` and `revalidatePath` in favor of React's `cache` and a unified TanStack Query invalidation predicate
- 删除了 `src/lib/cache-config.ts`，新增 `src/lib/query-keys.ts`

**推测原因：**
- `unstable_cache` API 不稳定，可能在未来版本变化
- React `cache` 是官方稳定 API
- 结合 TanStack Query 更易管理缓存失效

---

### 🟡 中等偏好：Zustand 管理客户端状态

**证据链：**
- `src/lib/store/` 目录存在
- 用于 modal 管理等轻量全局状态

---

## 5. UI/UX 实现风格

### 🔴 强偏好：提取可复用的交互组件

**证据链：**
- `d88a888`: Add IconPicker component and refactor CategorySection to use it and EditableField
- 从复杂的 modal 编辑转向 inline editing 模式

**模式：**
- `EditableField`：通用可编辑文本组件
- `IconPicker`：图标选择器（Popover + 网格）
- 使用 Lucide React 图标库

---

### 🔴 强偏好：骨架屏（Skeleton）优于 Spinner

**证据链：**
- `34b93c8`: feat: Implement skeleton loading states for LedgerEntry and SourceDocument detail modals
- `15be53e`: style: Update loading skeleton background color from `bg-muted` to `bg-border`
- `982517a`: feat: adding a new server action and a loading skeleton

**推测原因：**
- 骨架屏提供更好的感知性能
- 减少布局抖动
- 用户体验更专业

---

### 🟡 中等偏好：简化 UI 复杂度

**证据链：**
- `85d925f`: refactor: remove the settings button and its associated icon import
- `bbc8806`: 移除 `ThemeToggle` 和 `PendingBillsModal`
- `ec934b5`: migrate chart points from SVG circles to CSS-positioned divs

**推测原因：**
- "Less is more" 的设计理念
- 专注核心功能，减少视觉噪音

---

## 6. 测试与质量保证

### 🔴 强偏好：集成测试优于单元测试

**证据链：**
- `97bea76`: feat: Add integration tests for ledger cascade operations
- `755f335`: Add integration tests for ledger entry deletion and source document retry
- `53ee50e`: feat: Implement multi-user isolation for ledger API routes by adding a new integration test
- `tests/integration/` 目录下有大量测试文件

**推测原因：**
- 业务逻辑涉及 AI 服务和数据库，难以单元测试
- 集成测试验证真实的端到端行为
- 投入产出比更高

---

### 🔴 强偏好：Fixture 文件管理测试数据

**证据链：**
- `8fc57dc`: test: Add new receipt image fixtures
- `c537a9d`: test: Add new fixture images for receipt and unrecognized currency scenarios
- 测试使用真实图片验证 AI 解析流程

---

### 🟡 中等偏好：多阶段 AI Mock

**证据链：**
- `c2a9ba9`: feat: Implement multi-stage AI mocking for integration tests
- `9632a6c`: feat: Implement multi-stage AI pipeline for source document parsing with Stage 1, Stage 1.5 validation, and Stage 2

**模式：**
- Stage 1: 快速识别（货币、日期、基本信息）
- Stage 1.5: 验证完整性
- Stage 2: 详细解析

---

## 7. 性能优化策略

### 🔴 强偏好：SQL 层过滤优于内存过滤

**证据链：**
- `989261f`: improve task queue performance with SQL-level filtering
- 使用 `sql'json_extract(${taskRuns.input}, '$.ledgerId') = ${ledgerId}'` 在数据库层过滤

**模式：**
```typescript
// 在 SQL 层过滤，减少数据传输
.where(sql`json_extract(${taskRuns.input}, '$.ledgerId') = ${ledgerId}`)
```

---

### 🔴 强偏好：为常用查询添加索引

**证据链：**
- `989261f`: optimize database queries with new indexes for soft-deletes and relations
- `b8f5518`: add database indexes to receipts, transactions, and GPT tasks tables

**模式：**
- 为 `user_id`、`ledger_id` 外键添加索引
- 为 `deleted_at` 软删除列添加索引

---

### 🔴 强偏好：批处理替代逐条处理

**证据链：**
- `fa2b03c`: optimize currency conversion with batch processing and robust database transactions

---

### 🔴 强偏好：软删除模式

**证据链：**
- 几乎所有主表都使用 `deleted_at` 字段
- 查询中一致使用 `isNull(table.deletedAt)` 条件

---

## 8. 其他偏好

### 🟡 中等偏好：Locale-First 路由

**证据链：**
- 所有路由嵌套在 `[locale]` 段下
- 使用 `next-intl` 进行国际化
- `79975aa` → 当前：曾移除后又重新引入

---

### 🟡 中等偏好：Zod 进行边界校验

**证据链：**
- Server Actions 入参使用 Zod schema 校验
- 环境变量使用 Zod 校验
- API 响应使用 Zod 校验

---

## 汇总 Checklist（供 AI 助手使用）

当为该开发者生成代码时，遵循以下规则：

### 架构
- [ ] 优先使用嵌入式存储（SQLite + Drizzle ORM）而非外部服务
- [ ] 使用 Server Actions 而非 API Routes
- [ ] 任务队列使用内存实现，避免 Redis/BullMQ
- [ ] 遵循 Feature-Based 目录结构

### 代码风格
- [ ] Server Actions 直接 throw Error，不使用 Result 对象
- [ ] 使用 Zod 进行参数校验
- [ ] 使用 Drizzle ORM 进行类型安全的数据库操作
- [ ] 使用 `requireLedgerAccess` 模式防止 IDOR

### 状态管理
- [ ] 使用 TanStack Query 管理服务端状态
- [ ] 使用 React `cache` 而非 `unstable_cache`
- [ ] 使用 Zustand 管理客户端状态
- [ ] 使用细粒度的 query key 进行缓存失效

### UI 模式
- [ ] 提取可复用组件（如 IconPicker、EditableField）
- [ ] 使用骨架屏（Skeleton）而非 Spinner
- [ ] 倾向 inline editing 而非 modal editing
- [ ] 使用 Lucide React 图标库

### 测试
- [ ] 优先编写集成测试
- [ ] 使用 fixture 文件管理测试数据
- [ ] 复杂 AI 流程使用多阶段 Mock
- [ ] 测试多用户隔离场景

### 性能
- [ ] 在 SQL 层过滤数据（使用 `json_extract` 等）
- [ ] 为常用查询添加索引（外键、软删除列）
- [ ] 批处理替代逐条处理
- [ ] 使用软删除模式（`deleted_at`）

### 安全
- [ ] 所有数据访问验证 ledger 归属权
- [ ] 资源不存在或无权限时返回 null，防止信息泄露
- [ ] 使用 `forLedger` scoped query 模式

---

## 文档维护建议

- 每 50-100 次提交后重新分析
- 关注"减法"提交（移除功能）更新偏好
- 标注偏好变化的时间点

---

*分析基于 544 次提交，截止至 2026-02-07*
