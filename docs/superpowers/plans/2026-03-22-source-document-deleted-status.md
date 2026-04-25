# Source Document Deleted Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `source_documents` 的删除语义统一收敛到 `status = "deleted"`，同时保留 `deletedAt` 作为删除时间审计字段，不再把它当作“是否删除”的主判断条件。

**Architecture:** 不把 source document 的状态语义硬塞进通用 `forLedger()`，而是在 `source-document` 模块新增一个专用 lifecycle helper，集中生成“可见 source document”条件和“标记删除 patch”。所有 source document 读写路径、task queue 取消路径、stats/export 等跨模块消费者都改为依赖这个 helper；迁移脚本只做历史数据回填，把已有 `deletedAt IS NOT NULL` 的记录统一补成 `status = 'deleted'`。

**Tech Stack:** TypeScript, Next.js server actions, Drizzle ORM, SQLite/Better SQLite, Vitest

---

## Root Cause

当前问题不是单点 bug，而是同一语义被两套机制同时表达：

- `src/modules/source-document/types.ts` 里没有 `"deleted"`，删除语义没有进入主状态机。
- `src/persistence/schema/source-document.ts` 里还有 `deletedAt`，于是“已删除”只能靠额外字段表达。
- `src/lib/db/scoped-query.ts` 的 `forLedger(...).whereActive` 默认只认 `deletedAt IS NULL`，而 `sourceDocuments` 又在很多地方复用了它。
- 生产代码里至少有这些 source document 删除写路径：
  - `src/modules/source-document/application/use-cases/delete-source-document.ts`
  - `src/modules/source-document/application/use-cases/retry-source-document.ts`
  - `src/modules/source-document/application/use-cases/batch-retry-source-documents.ts`
  - `src/modules/source-document/application/parse-source-document/parse-result-handler.ts`
  - `src/modules/task-queue/application/use-cases/cancel-task.ts`
  - `src/modules/ledger/application/use-cases/delete-ledger.ts`
- 读取 source document 的地方也散落着 `isNull(sourceDocuments.deletedAt)` 或 `forLedger(sourceDocuments, ...)`：
  - source-document 自身查询
  - upload 访问校验
  - task queue anomaly/completed 映射
  - stats
  - ledger export
  - ledger entry filter SQL 子查询

这意味着如果只加一个 `"deleted"` 状态但不收口读写路径，代码会继续乱。

## Design Decisions

- 保留 `deletedAt`，但它只记录“何时删除”，不再决定“是否删除”。
- 不修改通用 `forLedger()` 的默认行为，因为只有 `sourceDocuments` 想把删除语义从 `deletedAt` 切到 `status`；把这个规则扩散到所有表会污染共享基础设施。
- 对外输入 schema 不开放 `"deleted"` 作为通用可写状态；删除仍然走 `deleteSourceDocumentAction` / `batchDeleteSourceDocumentsAction` / task cancel 这些显式入口。
- 查询侧统一收敛到一个 source-document 专用 helper，避免继续出现手写 `isNull(sourceDocuments.deletedAt)`。

## File Structure

### New Files

- `src/modules/source-document/application/source-document-state.ts`
  - source document 专用状态/lifecycle helper
  - 负责生成“未删除”的 where 条件
  - 负责生成“标记删除”的 patch

- `src/persistence/migrations/0028_source_document_deleted_status.sql`
  - 把历史 `deleted_at IS NOT NULL` 的 source document 回填成 `status = 'deleted'`

- `tests/integration/persistence/source-document-deleted-status-migration.test.ts`
  - 迁移 SQL 的 smoke test，验证 legacy 行会被改成 `deleted`

### Modified Files

- `src/modules/source-document/types.ts`
  - 增加 `"deleted"` 到存储状态枚举
  - 单独保留“活跃状态”常量给查询/schema 复用

- `src/modules/source-document/contract-schemas.ts`
  - 把对外 filter/update schema 限制在活跃状态

- `src/persistence/schema/source-document.ts`
  - 更新 `status` 列的 TypeScript 类型来源

- `src/modules/source-document/application/use-cases/delete-source-document.ts`
- `src/modules/source-document/application/use-cases/retry-source-document.ts`
- `src/modules/source-document/application/use-cases/batch-retry-source-documents.ts`
- `src/modules/source-document/application/use-cases/update-source-document.ts`
- `src/modules/source-document/application/queries/source-document-queries.ts`
- `src/modules/source-document/application/queries/get-source-document-detail.ts`
- `src/modules/source-document/application/queries/get-source-document-light.ts`
- `src/modules/source-document/application/queries/get-accessible-source-document-context.ts`
- `src/modules/source-document/application/queries/can-access-source-document-upload.ts`
- `src/modules/source-document/application/tasks/parse-source-document.ts`
- `src/modules/source-document/application/parse-source-document/context.ts`
- `src/modules/source-document/application/parse-source-document/pipeline.ts`
- `src/modules/source-document/application/parse-source-document/parse-result-handler.ts`
- `src/modules/source-document/grouping.ts`
- `src/modules/task-queue/application/use-cases/cancel-task.ts`
- `src/modules/task-queue/application/queries/get-task-queue.ts`
- `src/modules/stats/application/queries/get-enhanced-stats.ts`
- `src/modules/ledger/application/use-cases/export-ledger-entries.ts`
- `src/modules/ledger/application/queries/build-ledger-entry-filters.ts`
- `src/modules/ledger/application/use-cases/delete-ledger.ts`
- `tests/helpers/factories.ts`
- `tests/helpers/schema-setup.ts`

### Test Files To Modify

- `tests/integration/api/source-document-delete-idempotency.test.ts`
- `tests/integration/modules/task-queue/application/use-cases/cancel-task.test.ts`
- `tests/integration/task-queue/cancel-task-actions.test.ts`
- `tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
- `tests/integration/api/uploads-route.test.ts`
- `tests/integration/api/source-documents.test.ts`
- `tests/integration/api/source-document-delete-race-condition.test.ts`
- `tests/integration/source-document/retry-action.test.ts`
- `tests/integration/source-document/batch-retry-action.test.ts`
- `tests/integration/ledger-export.test.ts`
- `tests/integration/stats/enhanced-stats.test.ts`
- `tests/unit/modules/source-document/application/queries/get-source-document-detail.test.ts`
- `tests/unit/modules/source-document/application/queries/get-source-document-light.test.ts`
- `tests/unit/modules/source-document/application/queries/can-access-source-document-upload.test.ts`
- `tests/unit/modules/source-document/application/use-cases/delete-source-document.test.ts`
- `tests/unit/modules/source-document/grouping.test.ts`
- `tests/unit/source-document/contract-schemas.omission.test.ts`

### Intentionally Unchanged

- `src/lib/db/scoped-query.ts`
  - 继续服务通用 `deletedAt` 软删除表
  - source document 的状态化删除逻辑不应该藏到这里

---

## Task 1: 先写失败测试，复现删除写路径没有落到 `status = "deleted"`

**Files:**
- Modify: `tests/integration/api/source-document-delete-idempotency.test.ts`
- Modify: `tests/integration/modules/task-queue/application/use-cases/cancel-task.test.ts`
- Modify: `tests/unit/modules/source-document/application/use-cases/delete-source-document.test.ts`

- [ ] **Step 1: 在删除幂等性测试里先断言“删除后状态必须是 deleted”**

```typescript
const deletedDoc = await db.query.sourceDocuments.findFirst({
  where: eq(sourceDocuments.id, sourceDoc.id),
});

expect(deletedDoc?.status).toBe("deleted");
expect(deletedDoc?.deletedAt).not.toBeNull();
```

- [ ] **Step 2: 在 task cancel 测试里补断言，queued/processing 文档取消后必须进入 deleted 状态**

```typescript
expect(processingDoc?.status).toBe("deleted");
expect(processingDoc?.deletedAt).not.toBeNull();
expect(completedDoc?.status).toBe("completed");
```

- [ ] **Step 3: 在 delete use case 单测里把事务内 patch 的预期改成显式 deleted 状态**

```typescript
expect(txUpdateSetMock).toHaveBeenCalledWith(
  expect.objectContaining({
    status: "deleted",
    deletedAt: expect.any(Date),
  })
);
```

- [ ] **Step 4: 运行这组测试，确认当前实现还是红灯**

Run:

```bash
npx vitest run \
  tests/integration/api/source-document-delete-idempotency.test.ts \
  tests/integration/modules/task-queue/application/use-cases/cancel-task.test.ts \
  tests/unit/modules/source-document/application/use-cases/delete-source-document.test.ts
```

Expected:

- `FAIL`
- 删除后收到的 `status` 仍然是 `completed` / `processing` / `queued`

- [ ] **Step 5: 提交失败测试**

```bash
git add \
  tests/integration/api/source-document-delete-idempotency.test.ts \
  tests/integration/modules/task-queue/application/use-cases/cancel-task.test.ts \
  tests/unit/modules/source-document/application/use-cases/delete-source-document.test.ts
git commit -m "test: capture source document deleted status regressions"
```

---

## Task 2: 再写失败测试，复现“status=deleted 但 deletedAt 为空时仍被当作活跃文档”

**Files:**
- Modify: `tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
- Modify: `tests/integration/api/uploads-route.test.ts`
- Create: `tests/integration/persistence/source-document-deleted-status-migration.test.ts`

- [ ] **Step 1: 给 source-document 查询补一个“只靠 status=deleted 也必须隐藏”的回归测试**

```typescript
const deletedDoc = requireDefined(
  (
    await db.insert(sourceDocuments).values({
      ledgerId,
      text: "should be hidden",
      status: "deleted",
      deletedAt: null,
      imageUrls: [],
      entryDate: "2026-03-22",
    }).returning()
  )[0],
  "deleted source document"
);

const page = await listSourceDocumentsQuery(ledgerId, {});
expect(page.items.find((item) => item.id === deletedDoc.id)).toBeUndefined();
await expect(getSourceDocumentFullQuery(ledgerId, deletedDoc.id)).rejects.toThrow(NotFoundError);
```

- [ ] **Step 2: 给 uploads route 补一个“status=deleted 的文档即使引用了图片也不能访问”的测试**

```typescript
await db.insert(sourceDocuments).values({
  id: docId,
  ledgerId,
  status: "deleted",
  deletedAt: null,
  imageUrls: [`/api/uploads/${storageKey}`],
});

const response = await uploadsGET(createMockRequest("http://localhost/api/uploads/test"), {
  params: Promise.resolve({ path: [ledgerId, docId, "receipt.jpg"] }),
});

expect(response.status).toBe(404);
expect(mockDownload).not.toHaveBeenCalled();
```

- [ ] **Step 3: 新建 migration smoke test，先依赖还不存在的迁移文件让它失败**

```typescript
import { readFileSync } from "node:fs";

const migrationSql = readFileSync(
  "src/persistence/migrations/0028_source_document_deleted_status.sql",
  "utf8"
);

db.$client.exec(migrationSql);

const migrated = await db.query.sourceDocuments.findFirst({
  where: eq(sourceDocuments.id, legacyDoc.id),
});

expect(migrated?.status).toBe("deleted");
expect(migrated?.deletedAt?.toISOString()).toBe(legacyDeletedAt.toISOString());
```

- [ ] **Step 4: 跑这组测试，确认它们现在确实失败**

Run:

```bash
npx vitest run \
  tests/integration/modules/source-document/application/queries/source-document-queries.test.ts \
  tests/integration/api/uploads-route.test.ts \
  tests/integration/persistence/source-document-deleted-status-migration.test.ts
```

Expected:

- `FAIL`
- `status = "deleted"` 的记录仍会出现在查询/上传访问里
- migration test 会因为迁移文件不存在或内容未生效而失败

- [ ] **Step 5: 提交第二批失败测试**

```bash
git add \
  tests/integration/modules/source-document/application/queries/source-document-queries.test.ts \
  tests/integration/api/uploads-route.test.ts \
  tests/integration/persistence/source-document-deleted-status-migration.test.ts
git commit -m "test: capture deleted source document visibility regressions"
```

---

## Task 3: 建立 source document 的状态化删除基础设施，并补迁移

**Files:**
- Create: `src/modules/source-document/application/source-document-state.ts`
- Modify: `src/modules/source-document/types.ts`
- Modify: `src/modules/source-document/contract-schemas.ts`
- Modify: `src/persistence/schema/source-document.ts`
- Modify: `tests/helpers/factories.ts`
- Modify: `tests/helpers/schema-setup.ts`
- Create: `src/persistence/migrations/0028_source_document_deleted_status.sql`
- Modify: `src/persistence/migrations/meta/_journal.json`

- [ ] **Step 1: 给存储状态枚举增加 deleted，并把“活跃状态”拆成单独常量**

```typescript
export const SOURCE_DOCUMENT_STATUSES = [
  "queued",
  "processing",
  "completed",
  "anomaly",
  "failed",
  "deleted",
] as const;

export const ACTIVE_SOURCE_DOCUMENT_STATUSES = [
  "queued",
  "processing",
  "completed",
  "anomaly",
  "failed",
] as const;
```

- [ ] **Step 2: 新建 source-document-state helper，集中定义可见条件和删除 patch**

```typescript
import { and, eq, ne } from "drizzle-orm";
import { sourceDocuments } from "@/persistence";
import { SourceDocumentStatus } from "../types";

export function whereSourceDocumentNotDeleted(ledgerId: string) {
  return and(
    eq(sourceDocuments.ledgerId, ledgerId),
    ne(sourceDocuments.status, SourceDocumentStatus.Deleted)
  )!;
}

export function whereSourceDocumentNotDeletedId(ledgerId: string, sourceDocumentId: string) {
  return and(
    eq(sourceDocuments.id, sourceDocumentId),
    whereSourceDocumentNotDeleted(ledgerId)
  )!;
}

export function deletedSourceDocumentPatch(now = new Date()) {
  return {
    status: SourceDocumentStatus.Deleted,
    deletedAt: now,
    updatedAt: now,
  } as const;
}
```

- [ ] **Step 3: 把对外输入 schema 限制在活跃状态，避免通用 update/filter 入口写出 deleted**

```typescript
const sourceDocumentFilterStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "anomaly",
  "failed",
]);
```

- [ ] **Step 4: 写迁移 SQL，把历史 deletedAt 记录回填为 deleted 状态**

```sql
UPDATE source_documents
SET status = 'deleted'
WHERE deleted_at IS NOT NULL
  AND status <> 'deleted';
```

Run:

```bash
npm run db:generate -- --custom --name source_document_deleted_status
```

Expected:

- 生成或更新 `src/persistence/migrations/0028_source_document_deleted_status.sql`
- `src/persistence/migrations/meta/_journal.json` 收到新的 migration entry

- [ ] **Step 5: 更新测试夹具里的 source document 状态联合类型**

```typescript
status: "queued" | "processing" | "completed" | "anomaly" | "failed" | "deleted";
```

- [ ] **Step 6: 运行状态/迁移相关的最小测试集**

Run:

```bash
npx vitest run \
  tests/unit/source-document/contract-schemas.omission.test.ts \
  tests/integration/persistence/source-document-deleted-status-migration.test.ts
```

Expected:

- `PASS`

- [ ] **Step 7: 提交基础设施和迁移**

```bash
git add \
  src/modules/source-document/types.ts \
  src/modules/source-document/application/source-document-state.ts \
  src/modules/source-document/contract-schemas.ts \
  src/persistence/schema/source-document.ts \
  src/persistence/migrations/0028_source_document_deleted_status.sql \
  src/persistence/migrations/meta/_journal.json \
  tests/helpers/factories.ts \
  tests/helpers/schema-setup.ts
git commit -m "feat: add deleted source document status primitives"
```

---

## Task 4: 把所有 source document 删除写路径统一改成写 `status = "deleted"`

**Files:**
- Modify: `src/modules/source-document/application/use-cases/delete-source-document.ts`
- Modify: `src/modules/source-document/application/use-cases/retry-source-document.ts`
- Modify: `src/modules/source-document/application/use-cases/batch-retry-source-documents.ts`
- Modify: `src/modules/source-document/application/parse-source-document/parse-result-handler.ts`
- Modify: `src/modules/task-queue/application/use-cases/cancel-task.ts`
- Modify: `src/modules/ledger/application/use-cases/delete-ledger.ts`
- Modify: `tests/integration/api/source-document-delete-idempotency.test.ts`
- Modify: `tests/integration/modules/task-queue/application/use-cases/cancel-task.test.ts`
- Modify: `tests/integration/task-queue/cancel-task-actions.test.ts`
- Modify: `tests/integration/source-document/retry-action.test.ts`
- Modify: `tests/integration/source-document/batch-retry-action.test.ts`
- Modify: `tests/unit/modules/source-document/application/use-cases/delete-source-document.test.ts`

- [ ] **Step 1: delete-source-document 用统一 delete patch 取代 `q.softDelete`**

```typescript
const deletedAt = new Date();

tx.update(sourceDocuments)
  .set(deletedSourceDocumentPatch(deletedAt))
  .where(and(whereSourceDocumentNotDeleted(ledgerId), inArray(sourceDocuments.id, sourceDocumentIds)))
  .run();
```

- [ ] **Step 2: retry / batch retry 把旧文档从“只有 deletedAt”改成“status+deletedAt 一起写”**

```typescript
await db
  .update(sourceDocuments)
  .set(deletedSourceDocumentPatch())
  .where(whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId));
```

- [ ] **Step 3: parse task cancel 和 task queue cancel 统一走同一个 deleted patch**

```typescript
await db
  .update(sourceDocuments)
  .set(deletedSourceDocumentPatch())
  .where(
    and(
      whereSourceDocumentNotDeletedId(ledgerId, entityId),
      inArray(sourceDocuments.status, ["processing", "queued"])
    )
  );
```

- [ ] **Step 4: ledger 删除时也把 source document 统一落成 deleted 状态**

```typescript
tx.update(sourceDocuments)
  .set(deletedSourceDocumentPatch())
  .where(whereSourceDocumentNotDeleted(ledgerId))
  .run();
```

- [ ] **Step 5: 跑写路径相关测试**

Run:

```bash
npx vitest run \
  tests/unit/modules/source-document/application/use-cases/delete-source-document.test.ts \
  tests/integration/api/source-document-delete-idempotency.test.ts \
  tests/integration/modules/task-queue/application/use-cases/cancel-task.test.ts \
  tests/integration/task-queue/cancel-task-actions.test.ts \
  tests/integration/source-document/retry-action.test.ts \
  tests/integration/source-document/batch-retry-action.test.ts
```

Expected:

- `PASS`
- 旧文档/被取消文档的 `status` 都变成 `deleted`

- [ ] **Step 6: 提交删除写路径收口**

```bash
git add \
  src/modules/source-document/application/use-cases/delete-source-document.ts \
  src/modules/source-document/application/use-cases/retry-source-document.ts \
  src/modules/source-document/application/use-cases/batch-retry-source-documents.ts \
  src/modules/source-document/application/parse-source-document/parse-result-handler.ts \
  src/modules/task-queue/application/use-cases/cancel-task.ts \
  src/modules/ledger/application/use-cases/delete-ledger.ts \
  tests/integration/api/source-document-delete-idempotency.test.ts \
  tests/integration/modules/task-queue/application/use-cases/cancel-task.test.ts \
  tests/integration/task-queue/cancel-task-actions.test.ts \
  tests/integration/source-document/retry-action.test.ts \
  tests/integration/source-document/batch-retry-action.test.ts \
  tests/unit/modules/source-document/application/use-cases/delete-source-document.test.ts
git commit -m "feat: unify source document deletion write paths"
```

---

## Task 5: 把所有读取路径改成“按 status 过滤 deleted”，并清理跨模块消费者

**Files:**
- Modify: `src/modules/source-document/application/use-cases/update-source-document.ts`
- Modify: `src/modules/source-document/application/queries/source-document-queries.ts`
- Modify: `src/modules/source-document/application/queries/get-source-document-detail.ts`
- Modify: `src/modules/source-document/application/queries/get-source-document-light.ts`
- Modify: `src/modules/source-document/application/queries/get-accessible-source-document-context.ts`
- Modify: `src/modules/source-document/application/queries/can-access-source-document-upload.ts`
- Modify: `src/modules/source-document/application/tasks/parse-source-document.ts`
- Modify: `src/modules/source-document/application/parse-source-document/context.ts`
- Modify: `src/modules/source-document/application/parse-source-document/pipeline.ts`
- Modify: `src/modules/source-document/grouping.ts`
- Modify: `src/modules/task-queue/application/queries/get-task-queue.ts`
- Modify: `src/modules/stats/application/queries/get-enhanced-stats.ts`
- Modify: `src/modules/ledger/application/use-cases/export-ledger-entries.ts`
- Modify: `src/modules/ledger/application/queries/build-ledger-entry-filters.ts`
- Modify: `tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
- Modify: `tests/integration/api/uploads-route.test.ts`
- Modify: `tests/integration/api/source-documents.test.ts`
- Modify: `tests/integration/ledger-export.test.ts`
- Modify: `tests/integration/stats/enhanced-stats.test.ts`
- Modify: `tests/unit/modules/source-document/application/queries/get-source-document-detail.test.ts`
- Modify: `tests/unit/modules/source-document/application/queries/get-source-document-light.test.ts`
- Modify: `tests/unit/modules/source-document/application/queries/can-access-source-document-upload.test.ts`
- Modify: `tests/unit/modules/source-document/grouping.test.ts`

- [ ] **Step 1: source-document 自身所有查询/更新入口改用专用 helper，不再直接写 `isNull(sourceDocuments.deletedAt)`**

```typescript
const conditions = [
  whereSourceDocumentNotDeleted(ledgerId),
  buildStatusCondition(status),
  ...buildDateConditions(startDate, endDate),
].filter((condition): condition is SQL<unknown> => condition !== null);
```

- [ ] **Step 2: parse pipeline / task 启动前检查，也改成按 status 判断是否还活着**

```typescript
const doc = await db.query.sourceDocuments.findFirst({
  where: whereSourceDocumentNotDeletedId(input.ledgerId, input.sourceDocumentId),
});
```

- [ ] **Step 3: task queue、stats、export、ledger filter 这些跨模块 source document 消费者一起切换**

```typescript
where: and(
  eq(sourceDocuments.ledgerId, ledgerId),
  ne(sourceDocuments.status, "deleted"),
  gte(sourceDocuments.entryDate, startStr),
  lte(sourceDocuments.entryDate, endStr)
)
```

对于 `build-ledger-entry-filters.ts` 这种 raw SQL 子查询，直接把谓词替换成：

```typescript
sql`${ledgerEntries.sourceDocumentId} IN (
  SELECT id FROM source_documents
  WHERE ledger_id = ${ledgerId}
    AND status != 'deleted'
    AND entry_date >= ${filters.startDate}
)`
```

- [ ] **Step 4: grouping 显式忽略 deleted，避免以后把它误算进 pending/completed**

```typescript
case "deleted":
  break;
```

- [ ] **Step 5: 更新 SQL 断言测试，别再硬编码 `deleted_at is null`，改成匹配 status-not-deleted**

```typescript
expect(query).toMatch(/"source_documents"\."status"\s*(<>|!=)\s*('deleted'|\?)/);
expect(query).not.toContain('"source_documents"."deleted_at" is null');
```

- [ ] **Step 6: 运行读取路径和跨模块回归**

Run:

```bash
npx vitest run \
  tests/integration/modules/source-document/application/queries/source-document-queries.test.ts \
  tests/integration/api/uploads-route.test.ts \
  tests/integration/api/source-documents.test.ts \
  tests/integration/ledger-export.test.ts \
  tests/integration/stats/enhanced-stats.test.ts \
  tests/unit/modules/source-document/application/queries/get-source-document-detail.test.ts \
  tests/unit/modules/source-document/application/queries/get-source-document-light.test.ts \
  tests/unit/modules/source-document/application/queries/can-access-source-document-upload.test.ts \
  tests/unit/modules/source-document/grouping.test.ts
```

Expected:

- `PASS`
- `status = "deleted"` 的记录不会再出现在 source-document 列表、上传访问、stats、export 中

- [ ] **Step 7: 提交读取路径和跨模块过滤收口**

```bash
git add \
  src/modules/source-document/application/use-cases/update-source-document.ts \
  src/modules/source-document/application/queries/source-document-queries.ts \
  src/modules/source-document/application/queries/get-source-document-detail.ts \
  src/modules/source-document/application/queries/get-source-document-light.ts \
  src/modules/source-document/application/queries/get-accessible-source-document-context.ts \
  src/modules/source-document/application/queries/can-access-source-document-upload.ts \
  src/modules/source-document/application/tasks/parse-source-document.ts \
  src/modules/source-document/application/parse-source-document/context.ts \
  src/modules/source-document/application/parse-source-document/pipeline.ts \
  src/modules/source-document/grouping.ts \
  src/modules/task-queue/application/queries/get-task-queue.ts \
  src/modules/stats/application/queries/get-enhanced-stats.ts \
  src/modules/ledger/application/use-cases/export-ledger-entries.ts \
  src/modules/ledger/application/queries/build-ledger-entry-filters.ts \
  tests/integration/modules/source-document/application/queries/source-document-queries.test.ts \
  tests/integration/api/uploads-route.test.ts \
  tests/integration/api/source-documents.test.ts \
  tests/integration/ledger-export.test.ts \
  tests/integration/stats/enhanced-stats.test.ts \
  tests/unit/modules/source-document/application/queries/get-source-document-detail.test.ts \
  tests/unit/modules/source-document/application/queries/get-source-document-light.test.ts \
  tests/unit/modules/source-document/application/queries/can-access-source-document-upload.test.ts \
  tests/unit/modules/source-document/grouping.test.ts
git commit -m "refactor: read source documents by status instead of deletedAt"
```

---

## Task 6: 跑整体验证，防止 source-document 周边回归

**Files:**
- No new files
- Re-run changed tests before final handoff

- [ ] **Step 1: 跑 source-document 与 task-queue 相关的集成套件**

Run:

```bash
npx vitest run \
  tests/integration/modules/source-document \
  tests/integration/source-document \
  tests/integration/task-queue \
  tests/integration/api/source-document-delete-idempotency.test.ts \
  tests/integration/api/source-document-delete-race-condition.test.ts \
  tests/integration/api/uploads-route.test.ts
```

Expected:

- `PASS`

- [ ] **Step 2: 跑 unit suite，确保状态联合类型和 mocks 没被打断**

Run:

```bash
npm run test:unit
```

Expected:

- `PASS`

- [ ] **Step 3: 跑 lint**

Run:

```bash
npm run lint
```

Expected:

- `PASS`

- [ ] **Step 4: 如果时间允许，再跑完整 integration；如果太慢，至少保留上面的 focused suites 作为交付基线**

Run:

```bash
npm run test:integration
```

Expected:

- `PASS`

- [ ] **Step 5: 提交最终变更**

```bash
git add src tests docs/superpowers/plans/2026-03-22-source-document-deleted-status.md
git commit -m "feat: unify deleted state for source documents"
```

---

## Notes For The Implementer

- 这里最容易犯的错是“删一半”：写路径用了 `status = "deleted"`，但读路径还在看 `deletedAt IS NULL`。执行时一定按任务顺序推进，先有红灯测试，再做基础设施，再做写路径，再做读路径。
- 不要顺手把 `forLedger()` 改成识别 `status`。这会把 source document 的领域逻辑渗到所有表。
- `deletedAt` 仍然要继续写，因为它还是审计字段，也是幂等删除时最稳定的时间记录。
- `batchUpdateSourceDocumentsInputSchema` 不应该顺便开放 `"deleted"`；删除入口要保持显式。
