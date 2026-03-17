# 代码审查报告 - Cashier

审查日期：2026-03-08
审查范围：/Users/xiangyu/Projects/Cashier
代码规模：283+ 源文件，86+ 测试文件，8 个 Feature 模块

---

## 执行摘要

- **总体评分**：8.5/10
- **问题统计**：Critical 4, High 7, Medium 8, Low 12
- **主要风险**：数据库迁移操作存在数据丢失风险；部分 Actions 层包含过多业务逻辑；缺少关键并发测试
- **优先行动项**：
  1. 审查生产环境迁移脚本安全性
  2. 将业务逻辑从 Actions 迁移到 Services
  3. 添加核心并发场景测试

---

## 项目概览

### 技术栈

| 层级     | 技术                      |
| -------- | ------------------------- |
| 框架     | Next.js 16 (App Router)   |
| 语言     | TypeScript 5              |
| 数据库   | SQLite + Drizzle ORM      |
| 状态管理 | TanStack Query + Zustand  |
| AI       | OpenAI GPT-4o / DeepSeek  |
| 认证     | NextAuth.js + OTP         |
| 测试     | Vitest + in-memory SQLite |

### 架构概述

Cashier 采用 **Feature-based 分层架构**：

```
Presentation Layer: Next.js App Router + React Components
         ↓
Feature Layer: src/features/* (按领域划分)
  ├── server/actions     # Server Actions (API 层)
  ├── server/services    # 业务逻辑 (Service 层)
  ├── server/schema.ts   # Drizzle ORM 表定义
  └── components/        # 功能组件
         ↓
Core Layer: src/lib/* (基础设施)
  ├── db/               # 数据库连接和查询
  ├── flow/             # 任务引擎
  └── mutations/        # Mutation 封装
         ↓
Data Layer: SQLite
```

**关键架构决策：**

- Server Actions 作为主要 API 接口（非 API Routes）
- 进程内任务引擎处理后台 AI 任务（无需 Redis）
- 租户隔离通过 `ledgerId` 实现
- 软删除模式（所有表都有 `deletedAt` 字段）

### 质量初评

**优点：**

- 架构清晰，模块边界明确
- 类型安全，TypeScript 覆盖率高
- 命名规范，代码可读性好
- 测试覆盖核心业务逻辑

**改进空间：**

- 缺少 Prettier/ESLint 严格配置
- 部分文件偏大（超过 400 行）
- 数据库连接缺少错误处理
- 迁移脚本存在风险操作

---

## 详细发现

### 1. 架构设计审查

#### 🔴 Critical - Ledger Actions 违反分层原则

- **位置**: `src/features/ledger/server/actions/ledgers.ts:115-260`
- **描述**: `updateLedgerAction` 和 `recalculateEntriesConvertedAmount` 函数包含复杂的货币转换业务逻辑（批量获取条目、构建转换项、批量转换、版本管理）。这些逻辑应该属于 Service 层。
- **风险**:
  - Action 层臃肿，难以测试
  - 货币转换逻辑无法复用
  - 违反单一职责原则
- **建议**: 创建 `LedgerService` 类，将业务逻辑迁移到 Service 层。Action 只负责参数验证和调用 Service。

#### 🔴 Critical - Source Document Actions 直接操作数据库

- **位置**: `src/features/source-document/server/actions/create.ts`, `delete.ts`, `retry.ts`
- **描述**: Actions 直接操作数据库（`db.insert`, `db.update`）和直接与 `flowEngine` 交互，没有 Service 层抽象。
- **风险**: 数据库操作和业务逻辑混杂，难以测试和复用
- **建议**: 创建 `SourceDocumentService` 类，封装文档创建、删除、重试等操作。

#### 🟠 High - Flow Engine 隐式注册机制

- **位置**: `src/instrumentation.ts:10-12`, `src/features/source-document/server/tasks/parse-source-document.ts:404`
- **描述**: Task handler 通过模块导入时的副作用（`flowEngine.register()`）注册，依赖关系不清晰。
- **风险**: 模块加载顺序依赖，可能导致 handler 未注册就被调用
- **建议**: 采用显式注册模式，在 `instrumentation.ts` 中集中注册所有 handler。

#### 🟡 Medium - `forLedger` 辅助函数类型断言过于宽松

- **位置**: `src/lib/db/scoped-query.ts:23-32`
- **描述**: 使用 `as unknown as Record<string, SQL>` 进行类型断言。
- **建议**: 使用泛型约束确保传入的表具有必要的列。

---

### 2. 安全性审查

#### 🟠 High - batchUpdateLedgerEntriesAction 缺乏 Zod 验证

- **位置**: `src/features/ledger/server/actions/entries.ts:176-198`
- **描述**: 接受 `data: Record<string, unknown>` 参数，但没有使用 Zod schema 验证。
- **风险**: 可能传入非预期字段
- **建议**:
  ```typescript
  const batchUpdateSchema = z.object({
    categoryId: z.string().nullable().optional(),
    currency: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    itemName: z.string().optional(),
  });
  ```

#### 🟠 High - updateSourceDocumentAction 状态值验证缺失

- **位置**: `src/features/source-document/server/actions/update.ts:12-48`
- **描述**: 允许更新 `status` 字段，但没有验证状态值是否在允许的枚举范围内。
- **风险**: 可能设置无效状态值
- **建议**: 使用 Zod 枚举验证状态值。

#### 🟡 Medium - 图片数据处理缺乏大小和格式验证

- **位置**: `src/features/source-document/server/actions/helpers.ts:17-27`
- **描述**: 仅检查是否以 `data:` 或 `http` 开头，没有验证 base64 数据大小、格式或 MIME 类型。
- **风险**: 可能上传极大文件或 MIME 类型欺骗
- **建议**: 添加大小限制（10MB）和 MIME 类型白名单验证。

---

### 3. 错误处理与健壮性

#### 🟠 High - 数据库连接失败无错误处理

- **位置**: `src/lib/db/index.ts:13`
- **描述**: 数据库连接初始化没有 try-catch。如果 SQLite 文件路径无效、磁盘满、权限不足，`new Database(sqlitePath)` 会抛出异常。
- **风险**: 应用启动时崩溃，没有友好错误信息
- **建议**:
  ```typescript
  let client: Database.Database;
  try {
    client = globalForDb.conn ?? new Database(sqlitePath);
  } catch (error) {
    logger.error({ error, path: sqlitePath }, "Database connection failed");
    process.exit(1);
  }
  ```

#### 🟢 Low - serializeDate 非空断言（假阳性）

- **位置**: `src/lib/serialization/utils.ts:65-66` 等处
- **确认结果**: 虽然使用 `!` 非空断言，但数据库 schema 定义了 `notNull()` 约束，实际上不会触发。
- **建议**: 无需紧急修复，但可考虑改进类型定义消除断言。

---

### 4. 数据层审查

#### 🔴 Critical - 迁移 0006_task_runs_refactor.sql 数据丢失风险

- **位置**: `src/lib/db/migrations/0006_task_runs_refactor.sql`
- **描述**: 使用 `DROP TABLE IF EXISTS task_runs` 删除旧表并重新创建，没有先备份数据。
- **风险**: 生产环境中任何意外中断都可能导致 task_runs 表数据永久丢失
- **建议**: 在删除表之前创建临时备份表，或使用 `ALTER TABLE ... RENAME TO` 配合数据迁移。

#### 🔴 Critical - 迁移 0010_hot_rhodey.sql 外键约束临时禁用

- **位置**: `src/lib/db/migrations/0010_hot_rhodey.sql:1`
- **描述**: 使用 `PRAGMA foreign_keys=OFF` 禁用外键约束进行表重建。
- **风险**: 如果在禁用期间发生崩溃，外键约束可能保持禁用状态，导致数据不一致
- **建议**: 迁移完成后添加 `PRAGMA foreign_key_check` 验证。

#### 🟠 High - 软删除与外键级联删除的潜在冲突

- **描述**: 应用层使用软删除，但外键约束（如 `ON DELETE cascade`）在数据库硬删除时触发。
- **风险**: 软删除和硬删除行为不一致可能导致数据意外丢失或孤儿数据
- **建议**: 明确文档化软删除策略，硬删除时在应用层实现级联。

---

### 5. 并发与异步处理

#### 🟢 Low - useSmartPolling 竞态条件（假阳性）

- **位置**: `src/hooks/use-smart-polling.ts:26-41`
- **确认结果**: 虽然理论上可能存在竞态，但 React Query 的机制和 Hook 实例隔离确保了实际不会出现问题。
- **结论**: 当前实现安全，无需修复。

#### 🟠 High - useLedgerMutation 中乐观更新与 invalidateQueries 竞态

- **位置**: `src/lib/mutations/use-ledger-mutation.ts:185-198`
- **描述**: `onSettled` 中 `invalidateQueries` 是异步的，但乐观更新数据仍显示。如果用户在此期间再次触发 mutation，可能基于过期数据。
- **风险**: 快速连续操作可能导致数据覆盖
- **建议**: 在 `onMutate` 中设置全局锁或使用 `isPending` 状态禁用 UI 控件。

---

### 6. 测试覆盖与质量

#### 🔴 Critical - 并发测试缺失

- **描述**: 没有针对并发场景的测试：
  - 多个任务同时提交
  - 任务取消时的竞态条件
  - 两个用户同时修改同一账本
- **风险**: 生产环境可能出现竞态条件
- **建议**: 添加并发测试，使用 `Promise.all()` 模拟并发场景。

#### 🔴 Critical - AI Pipeline 端到端测试不完整

- **描述**: AI parsing 流程使用 "Dual GPT + Arbitration" 策略，但测试仅使用 mock 数据。
- **风险**: AI 集成中的边缘情况可能导致生产故障
- **建议**: 添加测试用例模拟仲裁场景和无效响应。

#### 🟠 High - 测试之间缺乏完全隔离

- **位置**: `tests/setup.ts:66-68`
- **描述**: 测试清理使用 `DELETE FROM` 而不是事务回滚。
- **风险**: 测试数据可能泄漏到后续测试
- **建议**: 使用事务包装每个测试并在之后回滚。

---

## 跨角度问题模式

### 1. Actions 层职责过重

多个 feature 的 Actions 层包含业务逻辑而非简单的参数验证和委托。这违反了分层架构原则，导致代码难以测试和复用。

### 2. 类型安全与运行时验证的脱节

部分代码依赖 TypeScript 类型系统保证安全，但缺少运行时验证（如 Zod）。这在处理用户输入时尤其危险。

### 3. 乐观更新模式的一致性问题

虽然项目使用了统一的 `useLedgerMutation` 封装，但乐观更新与后续状态同步之间仍可能存在竞态。

---

## 行动建议

### 立即处理（本周）

1. **审查生产环境迁移脚本安全性**
   - 评估迁移 0006 和 0010 的生产部署影响
   - 准备回滚方案

2. **添加数据库连接错误处理**
   - `src/lib/db/index.ts` 添加 try-catch
   - 添加友好的错误日志

3. **为关键 Actions 添加 Zod 验证**
   - `batchUpdateLedgerEntriesAction`
   - `updateSourceDocumentAction`

### 短期处理（本月）

1. **提取 Service 层**
   - `ledgers.ts` 中的货币转换逻辑 → `LedgerService`
   - `source-document` actions → `SourceDocumentService`

2. **添加并发测试**
   - 多任务同时提交测试
   - 多用户同时修改测试

3. **改进迁移流程**
   - 添加迁移前备份机制
   - 迁移后添加外键约束验证

### 中期改进（下季度）

1. **统一错误处理策略**
   - 定义错误类型层次
   - 统一错误转换和日志记录

2. **添加性能基准测试**
   - 大数据量查询性能
   - AI 处理超时测试

3. **完善文档**
   - 软删除策略文档
   - 任务引擎架构文档

### 长期规划

1. **考虑引入 Prettier 和更严格的 ESLint 配置**
2. **评估将 SQLite 迁移到 PostgreSQL 的可行性**（如果数据量增长）
3. **建立自动化性能监控**

---

## 附录

### A. 审查覆盖范围

**已审查的文件类别：**

- 核心基础设施：`src/lib/db/`, `src/lib/flow/`, `src/lib/mutations/`
- Feature 模块：`src/features/*/server/`
- 前端 Hooks：`src/hooks/`, `src/features/*/client/hooks/`
- 测试套件：`tests/integration/`, `tests/unit/`
- 迁移文件：`src/lib/db/migrations/`

### B. 工具与配置建议

**建议添加的配置：**

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 4,
  "trailingComma": "es5"
}
```

**建议的 ESLint 规则：**

- `@typescript-eslint/no-non-null-assertion`: warn
- `@typescript-eslint/explicit-function-return-type`: off (已有良好类型推断)

### C. 参考资源

- [Drizzle ORM 文档](https://orm.drizzle.team/)
- [TanStack Query 最佳实践](https://tanstack.com/query/latest/docs/framework/react/guides/best-practices)
- [Next.js Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
