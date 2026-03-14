# 数据库优化实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实施所有数据库相关优化，包括索引优化、查询优化、SQLite PRAGMA 配置和代码效率改进

**Architecture:** 保持现有 SQLite + Drizzle ORM 架构不变，通过添加 PRAGMA 配置、优化查询模式和补充索引来提升性能

**Tech Stack:** SQLite (better-sqlite3), Drizzle ORM, TypeScript, Vitest

---

## Chunk 1: SQLite PRAGMA 配置优化

### Task 1.1: 添加 SQLite PRAGMA 优化配置

**Files:**
- Modify: `src/lib/db/index.ts`

**Context:** 当前数据库连接缺少 PRAGMA 优化配置，需要添加 WAL 模式、外键约束等以提升性能和数据完整性。

- [ ] **Step 1: 修改数据库连接配置**

```typescript
// src/lib/db/index.ts
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

const sqlitePath = (process.env.DATABASE_URL || "sqlite.db").replace(
    /^file:/,
    "",
);

// Singleton pattern for database connection
const globalForDb = global as unknown as {
    conn: Database.Database | undefined;
};

const client = globalForDb.conn ?? new Database(sqlitePath);

// Configure SQLite PRAGMA for performance
client.pragma("journal_mode = WAL");
client.pragma("foreign_keys = ON");
client.pragma("synchronous = NORMAL");

if (process.env.NODE_ENV !== "production") {
    globalForDb.conn = client;
}

export const db = drizzle(client, { schema });
export { client };
```

- [ ] **Step 2: 验证配置生效**

运行开发服务器确认无错误：
```bash
npm run dev
# 预期：服务器正常启动，无数据库错误
```

- [ ] **Step 3: 运行测试**

```bash
npm run test:run
# 预期：所有测试通过
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/index.ts
git commit -m "perf(db): add SQLite PRAGMA optimization (WAL mode, foreign keys)"
```

---

## Chunk 2: 数据库索引优化

### Task 2.1: 添加 task_runs 复合索引

**Files:**
- Modify: `src/features/task-queue/server/schema.ts`

**Context:** task_runs 表查询经常需要按 type + status + entity_type + entity_id 过滤，需要添加对应索引。

- [ ] **Step 1: 添加复合索引到 schema**

```typescript
// src/features/task-queue/server/schema.ts
// 在现有索引后添加
export const taskRunsIndexes = {
    // 现有索引...
    idxTaskRunsTypeStatusEntity: index("idx_task_runs_type_status_entity").on(
        table.type,
        table.status,
        table.entityType,
        table.entityId,
    ),
};
```

- [ ] **Step 2: 生成迁移文件**

```bash
npm run db:generate
# 预期：生成新的迁移文件，包含新索引创建语句
```

- [ ] **Step 3: 运行迁移**

```bash
npm run db:migrate
# 预期：迁移成功执行
```

- [ ] **Step 4: Commit**

```bash
git add src/features/task-queue/server/schema.ts src/lib/db/migrations/
git commit -m "perf(db): add composite index for task_runs type/status/entity queries"
```

### Task 2.2: 添加 ledger_entries 复合索引

**Files:**
- Modify: `src/features/ledger/server/schema.ts`

**Context:** ledger_entries 的分类统计查询需要 ledger_id + category_id + deleted_at 的复合索引。

- [ ] **Step 1: 添加复合索引到 schema**

```typescript
// src/features/ledger/server/schema.ts
// 在现有索引后添加
idxLedgerEntriesLedgerCategoryDeleted: index("idx_ledger_entries_ledger_category_deleted").on(
    table.ledgerId,
    table.categoryId,
    table.deletedAt,
),
```

- [ ] **Step 2: 生成并运行迁移**

```bash
npm run db:generate
npm run db:migrate
# 预期：迁移成功
```

- [ ] **Step 3: Commit**

```bash
git add src/features/ledger/server/schema.ts src/lib/db/migrations/
git commit -m "perf(db): add composite index for ledger_entries category queries"
```

---

## Chunk 3: 查询优化 - 子查询改 JOIN

### Task 3.1: 优化 entries.ts 中的日期过滤

**Files:**
- Modify: `src/features/ledger/server/actions/entries.ts`

**Context:** 当前使用 IN 子查询进行日期过滤，在数据量大时性能较差，应改为 JOIN。

- [ ] **Step 1: 添加新查询方法**

在文件末尾添加新的查询函数（不要替换旧的，先并行存在）：

```typescript
// src/features/ledger/server/actions/entries.ts
// 在文件末尾添加

import { sourceDocuments } from "@/features/source-document/server/schema";

/**
 * 优化的查询：使用 JOIN 替代子查询进行日期过滤
 */
async function fetchEntriesWithDateJoin(
    ledgerId: string,
    params: EntryListParams,
    limit: number,
) {
    const conditions: (SQL<unknown> | undefined)[] = [
        eq(ledgerEntries.ledgerId, ledgerId),
        isNull(ledgerEntries.deletedAt),
    ];

    // 使用 JOIN 替代子查询
    const joinConditions: (SQL<unknown> | undefined)[] = [
        eq(ledgerEntries.sourceDocumentId, sourceDocuments.id),
        eq(sourceDocuments.ledgerId, ledgerId),
        isNull(sourceDocuments.deletedAt),
    ];

    if (params.startDate) {
        joinConditions.push(gte(sourceDocuments.entryDate, params.startDate));
    }
    if (params.endDate) {
        joinConditions.push(lte(sourceDocuments.entryDate, params.endDate));
    }

    // 其他过滤条件...
    if (params.cursor) {
        const [cursorDate, cursorId] = params.cursor.split("_");
        conditions.push(
            or(
                lt(ledgerEntries.createdAt, new Date(cursorDate)),
                and(
                    eq(ledgerEntries.createdAt, new Date(cursorDate)),
                    lt(ledgerEntries.id, cursorId),
                ),
            ),
        );
    }

    const items = await db
        .select({
            entry: ledgerEntries,
            sourceDocument: {
                id: sourceDocuments.id,
                title: sourceDocuments.title,
                entryDate: sourceDocuments.entryDate,
                status: sourceDocuments.status,
            },
        })
        .from(ledgerEntries)
        .innerJoin(sourceDocuments, and(...joinConditions))
        .where(and(...conditions))
        .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
        .limit(limit + 1);

    return items.map(({ entry, sourceDocument }) => ({
        ...entry,
        sourceDocument,
    }));
}
```

- [ ] **Step 2: 更新原有函数使用 JOIN**

找到 `fetchEntries` 函数，将日期过滤逻辑替换为使用 JOIN 的版本。

```typescript
// 找到 fetchEntries 函数，替换日期过滤部分
// 从：
if (params.startDate) {
    conditions.push(
        sql`${ledgerEntries.sourceDocumentId} IN (
            SELECT id FROM ${sourceDocuments}
            WHERE ledger_id = ${ledgerId} AND entry_date >= ${params.startDate} AND deleted_at IS NULL
        )`,
    );
}

// 改为使用上面定义的 fetchEntriesWithDateJoin 或直接内联修改
```

- [ ] **Step 3: 运行测试验证**

```bash
npx vitest run tests/integration/entries.test.ts
# 预期：测试通过
```

- [ ] **Step 4: Commit**

```bash
git add src/features/ledger/server/actions/entries.ts
git commit -m "perf(db): optimize entries query using JOIN instead of subquery"
```

### Task 3.2: 优化 stats.ts 中的日期过滤

**Files:**
- Modify: `src/features/ledger/server/actions/stats.ts`

**Context:** stats.ts 中的统计查询也使用子查询，需要优化。

- [ ] **Step 1: 修改统计查询函数**

找到 `fetchStats` 函数，修改日期过滤逻辑：

```typescript
// src/features/ledger/server/actions/stats.ts
// 修改日期过滤部分

// 原有子查询方式：
// sql`${ledgerEntries.sourceDocumentId} IN (SELECT id FROM source_documents WHERE ...)`

// 改为使用 JOIN 的方式
import { sourceDocuments } from "@/features/source-document/server/schema";

// 在查询中修改 WHERE 条件构建
const joinConditions = [
    eq(ledgerEntries.sourceDocumentId, sourceDocuments.id),
    eq(sourceDocuments.ledgerId, ledgerId),
    isNull(sourceDocuments.deletedAt),
];

if (startDate) {
    joinConditions.push(gte(sourceDocuments.entryDate, startDate));
}
if (endDate) {
    joinConditions.push(lte(sourceDocuments.entryDate, endDate));
}

// 然后使用 JOIN 查询
const entries = await db
    .select({
        entry: ledgerEntries,
        sourceDocument: {
            entryDate: sourceDocuments.entryDate,
        },
    })
    .from(ledgerEntries)
    .innerJoin(sourceDocuments, and(...joinConditions))
    .where(and(...conditions));
```

- [ ] **Step 2: 运行测试**

```bash
npx vitest run tests/integration/stats.test.ts
# 预期：测试通过
```

- [ ] **Step 3: Commit**

```bash
git add src/features/ledger/server/actions/stats.ts
git commit -m "perf(db): optimize stats query using JOIN instead of subquery"
```

---

## Chunk 4: 代码效率优化

### Task 4.1: 并行化任务取消操作

**Files:**
- Modify: `src/features/ledger/server/actions/delete.ts`
- Modify: `src/features/source-document/server/actions/delete.ts`

**Context:** 当前循环中顺序取消任务，可以改为并行执行。

- [ ] **Step 1: 修改账本删除中的任务取消**

```typescript
// src/features/ledger/server/actions/delete.ts
// 找到相关任务取消代码，大约在第 49 行

// 原有代码：
// for (const task of relatedTaskRuns) {
//     if (task.status === 'pending' || task.status === 'running') {
//         await flowEngine.cancel(task.id);
//     }
// }

// 改为并行执行：
const cancelPromises = relatedTaskRuns
    .filter(task => task.status === 'pending' || task.status === 'running')
    .map(task => flowEngine.cancel(task.id));

await Promise.all(cancelPromises);
```

- [ ] **Step 2: 修改凭证删除中的任务取消**

```typescript
// src/features/source-document/server/actions/delete.ts
// 大约在第 37 行

// 原有代码：
// for (const task of runningTasks) {
//     await flowEngine.cancel(task.id);
// }

// 改为并行执行：
await Promise.all(runningTasks.map(task => flowEngine.cancel(task.id)));
```

- [ ] **Step 3: 运行测试**

```bash
npm run test:run
# 预期：所有测试通过
```

- [ ] **Step 4: Commit**

```bash
git add src/features/ledger/server/actions/delete.ts src/features/source-document/server/actions/delete.ts
git commit -m "perf: parallelize task cancellation in delete operations"
```

### Task 4.2: 优化 helpers.ts 中的批量数据加载

**Files:**
- Modify: `src/features/ledger/server/actions/helpers.ts`

**Context:** `fetchEntriesForConversion` 函数可能加载大量数据，建议添加分批处理支持。

- [ ] **Step 1: 添加分批处理支持**

```typescript
// src/features/ledger/server/actions/helpers.ts

const BATCH_SIZE = 1000;

/**
 * 分批获取需要转换货币的 entries
 */
export async function* fetchEntriesForConversionBatched(
    ledgerId: string,
): AsyncGenerator<typeof ledgerEntries.$inferSelect[]> {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        const batch = await db.query.ledgerEntries.findMany({
            where: and(
                eq(ledgerEntries.ledgerId, ledgerId),
                isNull(ledgerEntries.deletedAt),
            ),
            with: { sourceDocument: true },
            limit: BATCH_SIZE,
            offset,
        });

        if (batch.length === 0) {
            hasMore = false;
        } else {
            yield batch;
            offset += batch.length;
            hasMore = batch.length === BATCH_SIZE;
        }
    }
}

// 保留原函数用于向后兼容，但标记为废弃
/**
 * @deprecated Use fetchEntriesForConversionBatched for large datasets
 */
export async function fetchEntriesForConversion(ledgerId: string) {
    return db.query.ledgerEntries.findMany({
        where: and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)),
        with: { sourceDocument: true },
    });
}
```

- [ ] **Step 2: 更新使用方代码（可选）**

检查哪些代码使用了 `fetchEntriesForConversion`，如果处理大量数据，考虑使用新的批量版本。

- [ ] **Step 3: 运行测试**

```bash
npm run test:run
# 预期：所有测试通过
```

- [ ] **Step 4: Commit**

```bash
git add src/features/ledger/server/actions/helpers.ts
git commit -m "perf: add batched fetch for entries conversion to handle large datasets"
```

---

## Chunk 5: 验证和回归测试

### Task 5.1: 完整测试验证

- [ ] **Step 1: 运行完整测试套件**

```bash
npm run test:run
# 预期：所有测试通过
```

- [ ] **Step 2: 运行 lint 检查**

```bash
npm run lint
# 预期：无错误
```

- [ ] **Step 3: 验证构建**

```bash
npm run build
# 预期：构建成功
```

- [ ] **Step 4: 最终 Commit**

```bash
git commit --allow-empty -m "perf(db): complete database optimization pass

Optimizations applied:
- SQLite PRAGMA: WAL mode, foreign keys, synchronous=NORMAL
- Added composite indexes for task_runs and ledger_entries
- Converted subqueries to JOINs in entries and stats queries
- Parallelized task cancellation operations
- Added batched fetching for large entry datasets"
```

---

## 附录：相关文件参考

### Schema 文件
- `src/features/auth/server/schema.ts` - 用户认证表
- `src/features/currency/server/schema.ts` - 汇率表
- `src/features/ledger/server/schema.ts` - 账本、分类、分录表
- `src/features/source-document/server/schema.ts` - 原始凭证表
- `src/features/task-queue/server/schema.ts` - 任务队列表

### 需要修改的核心文件
- `src/lib/db/index.ts` - 数据库连接配置
- `src/features/ledger/server/actions/entries.ts` - 分录查询
- `src/features/ledger/server/actions/stats.ts` - 统计查询
- `src/features/ledger/server/actions/delete.ts` - 删除操作
- `src/features/ledger/server/actions/helpers.ts` - 辅助函数
- `src/features/source-document/server/actions/delete.ts` - 凭证删除

### 测试文件
- `tests/integration/entries.test.ts` - 分录相关测试
- `tests/integration/stats.test.ts` - 统计相关测试
