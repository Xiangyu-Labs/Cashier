# Deleted Source Document Entry Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一设置页分类计数、明细查询、解析写入和历史数据回填的“可见分录”语义，修复已删除 `source_document` 仍留下活跃 `ledger_entries` 的问题。

**Architecture:** 先把“用户可见分录”收口成一个共享 SQL 条件，规则是“分录未软删，且 `source_document` 为空或对应 document 仍未删除”。设置页分类计数和明细查询都改用这套规则，消除“设置里有，明细里没有”的口径分裂。然后把 `handleParseResult()` 的事务顺序改成“先在事务内确认 document 仍可写，再替换 entries”，堵住解析完成与删除并发时写入脏数据的窗口；最后用一次数据迁移把现存的脏分录软删掉。

**Tech Stack:** TypeScript, Next.js server actions, Drizzle ORM, SQLite/Better SQLite, Vitest

---

## Scope Check

这次问题横跨 `ledger` 和 `source-document` 两个模块，但它们服务的是同一个修复目标：

- 设置页分类计数不能再统计“用户在明细里永远看不到”的分录。
- 解析任务不能再把新分录写进已经删除的 `source_document`。
- 现有数据库里已经留下的脏数据必须回填，否则只改代码不能修复用户当前看到的数字。

因此这里保持为一个计划，不再拆分。拆开会导致中途任何一个分支落地后都还是半修状态。

## Root Cause

当前问题不是 “`其他` 实际上是未分类”，而是两层问题叠在一起：

1. 查询口径不一致
   - 设置页分类计数 `src/modules/ledger/application/use-cases/list-entry-categories-with-count.ts:14-21` 只过滤了 `ledger_entries.deleted_at IS NULL`，没有排除挂在已删除 `source_document` 下的分录。
   - 明细页查询构建器 `src/modules/ledger/application/queries/build-ledger-entry-filters.ts:26-40` 在日期过滤子查询中排除了 `status = 'deleted'` 的 `source_documents`，所以用户筛选时看不到这些分录。

2. 删除/解析并发会制造脏数据
   - `src/modules/source-document/application/parse-source-document/parse-result-handler.ts:35-103` 在事务外先查一次 “document 未删除”，随后构建 entries。
   - 真正事务内的顺序却是先 `replaceSourceDocumentLedgerEntries()`，再 `update sourceDocuments ... where whereSourceDocumentNotDeletedId(...)`。
   - 如果 document 在这两步之间被删掉，就会出现 “document 已删除，但新 entries 已插入且仍活跃”。

数据库现状已经证明了这个竞态确实发生过。当前库里不只是 “其他 4 条”，还有总计 25 条活跃分录挂在 `status = 'deleted'` 的 `source_documents` 下。

## Design Decisions

- “用户可见分录”规则集中成一个 helper，不再在设置页、明细页各写一套 SQL。
- 这个 helper 必须保留 `sourceDocumentId IS NULL` 的分录，避免误伤没有关联 document 的分录。
- 解析完成写入不依赖事务外的预检结果，事务内必须先拿到 “document 仍可写” 的证据，再替换 entries。
- 历史脏数据不靠查询层永久绕过去，而是用 migration 软删回填，避免继续污染统计、导出、后续审计 SQL。

## File Structure

### New Files

- `src/modules/ledger/application/queries/ledger-entry-visibility.ts`
  - 共享 “用户可见 ledger entry” 条件。
  - 负责表达 “entry 未软删 + sourceDocument 为空或对应 document 未删除”。

- `src/persistence/migrations/0029_soft_delete_entries_under_deleted_source_documents.sql`
  - 一次性软删历史脏数据。
  - 只处理 `ledger_entries.deleted_at IS NULL` 且其 `source_document` 已删除的行。

- `tests/integration/persistence/deleted-source-document-ledger-entry-migration.test.ts`
  - 迁移 smoke test。
  - 验证 migration 执行后，脏分录会被软删而不是保留活跃状态。

### Modified Files

- `src/modules/ledger/application/use-cases/list-entry-categories-with-count.ts:14-21`
  - 分类计数改成只统计 “用户可见分录”。

- `src/modules/ledger/application/queries/build-ledger-entry-filters.ts:16-60`
  - 把“排除已删除 source document”从日期过滤的副作用，升级成所有 ledger entry 查询的基础条件。

- `src/modules/source-document/application/parse-source-document/parse-result-handler.ts:35-103`
  - 事务内先判断 document 是否仍未删除。
  - 只有判断通过时才替换 entries 并标记 `completed`。

- `tests/integration/ledger/category-actions.test.ts:313-364`
  - 新增/改写计数回归测试，证明已删除 `source_document` 下的 entries 不能计入分类。

- `tests/integration/api/ledger-entries.test.ts:1-95`
  - 新增回归测试，证明在不传日期过滤时，明细查询同样不会返回已删除 `source_document` 下的 entries。

- `tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts:1-237`
  - 增加删除竞态测试，稳定复现 “preflight 成功后 document 被删” 的窗口。

- `src/persistence/migrations/meta/_journal.json`
  - 追加 `0029_soft_delete_entries_under_deleted_source_documents` 迁移记录。

### Intentionally Unchanged

- `src/modules/stats/application/queries/get-enhanced-stats.ts`
  - 这里已经通过 `whereSourceDocumentNotDeleted()` 排除了已删除 document，对本次修复只作为验证门，不需要改实现。

- `src/modules/source-document/application/services/source-document-ledger-entries.ts`
  - 不在这里新增第二套删除判断，避免和 `parse-result-handler.ts` 形成双重时序语义；本次直接在唯一出问题的 parse completion 事务里收口。

---

## Task 1: 先写失败测试，锁定“设置计数”和“明细列表”必须使用同一套可见分录规则

**Files:**
- Modify: `tests/integration/ledger/category-actions.test.ts:313-364`
- Modify: `tests/integration/api/ledger-entries.test.ts:1-95`

- [ ] **Step 1: 在 `category-actions.test.ts` 里新增一个回归测试，只统计未删除 document 的 entries**

```typescript
it("excludes entries whose source document is deleted from category counts", async () => {
  const db = getTestDb();
  const catId = uuidv4();
  await db.insert(entryCategories).values({
    id: catId,
    ledgerId,
    name: "其他",
    sortOrder: 1,
  });

  const [activeDoc, deletedDoc] = await db
    .insert(sourceDocuments)
    .values([
      {
        id: uuidv4(),
        ledgerId,
        text: "active",
        status: "completed",
        imageUrls: [],
      },
      {
        id: uuidv4(),
        ledgerId,
        text: "deleted",
        status: "deleted",
        deletedAt: new Date("2026-03-24T00:00:00.000Z"),
        imageUrls: [],
      },
    ])
    .returning();

  await db.insert(ledgerEntries).values([
    {
      id: uuidv4(),
      ledgerId,
      sourceDocumentId: activeDoc!.id,
      categoryId: catId,
      itemName: "visible",
      amount: "10.00",
      currency: "CNY",
    },
    {
      id: uuidv4(),
      ledgerId,
      sourceDocumentId: deletedDoc!.id,
      categoryId: catId,
      itemName: "hidden",
      amount: "20.00",
      currency: "CNY",
    },
  ]);

  const result = await getEntryCategoriesAction(ledgerId);
  expect(result.find((category) => category.id === catId)?.entryCount).toBe(1);
});
```

- [ ] **Step 2: 在 `ledger-entries.test.ts` 里新增一个回归测试，不传日期过滤时也不能返回已删除 document 的 entries**

```typescript
it("hides entries whose source document is deleted even without date filters", async () => {
  const db = getTestDb();
  const deletedDoc = await db
    .insert(sourceDocuments)
    .values({
      ledgerId: testLedgerId,
      text: "deleted doc",
      status: "deleted",
      deletedAt: new Date("2026-03-24T00:00:00.000Z"),
      imageUrls: [],
    })
    .returning();

  const hiddenDoc = deletedDoc[0];
  if (hiddenDoc == null) throw new Error("Expected deleted source document");

  await db.insert(ledgerEntries).values([
    {
      ledgerId: testLedgerId,
      categoryId: testCategoryId,
      sourceDocumentId: testSourceDocId,
      amount: "25.50",
      itemName: "visible item",
    },
    {
      ledgerId: testLedgerId,
      categoryId: testCategoryId,
      sourceDocumentId: hiddenDoc.id,
      amount: "99.00",
      itemName: "hidden item",
    },
  ]);

  const data = await getLedgerEntriesAction(testLedgerId, {});
  expect(data.items.map((item) => item.itemName)).toEqual(["visible item"]);
});
```

- [ ] **Step 3: 运行测试，确认当前实现会红灯**

Run:

```bash
npx vitest run --config vitest.integration.config.ts \
  tests/integration/ledger/category-actions.test.ts \
  tests/integration/api/ledger-entries.test.ts
```

Expected:

- `FAIL`
- 分类计数当前会把 deleted source document 下的 entry 也算进去
- `getLedgerEntriesAction(..., {})` 当前仍可能返回 deleted source document 下的 entry

- [ ] **Step 4: 提交失败测试**

```bash
git add \
  tests/integration/ledger/category-actions.test.ts \
  tests/integration/api/ledger-entries.test.ts
git commit -m "test: capture deleted source document entry visibility regressions"
```

---

## Task 2: 再写失败测试，复现 parse completion 在删除竞态下写出脏数据

**Files:**
- Modify: `tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts:1-237`

- [ ] **Step 1: 给 `entry-builder` 加一个 hoisted mock，让 `buildEntriesForInsert()` 可以在测试里制造竞态**

把文件顶部的 mock 改成：

```typescript
const { convertEntryAmountMock, buildEntriesForInsertMock } = vi.hoisted(() => ({
  convertEntryAmountMock: vi.fn(),
  buildEntriesForInsertMock: vi.fn(),
}));

vi.mock(
  "@/modules/source-document/application/parse-source-document/entry-builder",
  async () => {
    const actual = await vi.importActual(
      "@/modules/source-document/application/parse-source-document/entry-builder"
    );
    return {
      ...actual,
      buildEntriesForInsert: buildEntriesForInsertMock,
    };
  }
);
```

- [ ] **Step 2: 新增一个删除竞态测试**

```typescript
it("does not leave active entries behind when the source document is deleted after preflight", async () => {
  const db = getTestDb();
  const { ledgerId } = await createTestUserWithLedger(db);
  const doc = await createSourceDocument(ledgerId);

  buildEntriesForInsertMock.mockImplementationOnce(async () => {
    await db
      .update(sourceDocuments)
      .set({
        status: "deleted",
        deletedAt: new Date("2026-03-24T12:00:00.000Z"),
      })
      .where(eq(sourceDocuments.id, doc.id));

    return [
      {
        ledgerId,
        sourceDocumentId: doc.id,
        categoryId: null,
        amount: "10.00",
        currency: "CNY",
        itemName: "late entry",
        description: null,
        convertedAmount: "10.00",
        exchangeRate: "1",
      },
    ];
  });

  await handleParseResult({
    ledgerId,
    sourceDocumentId: doc.id,
    parsedEntries: [
      {
        amount: 10,
        currency: "CNY",
        categoryIndex: 0,
        entryDate: null,
        itemName: "late entry",
        notes: null,
      },
    ],
    verificationStatus: "passed",
    categories: [],
  });

  const refreshed = await db.query.sourceDocuments.findFirst({
    where: eq(sourceDocuments.id, doc.id),
  });

  expect(refreshed?.status).toBe("deleted");
  expect(await listActiveEntries(doc.id)).toEqual([]);
});
```

- [ ] **Step 3: 运行测试，确认当前实现会把脏 entry 留下来**

Run:

```bash
npx vitest run --config vitest.unit.config.ts \
  tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts
```

Expected:

- `FAIL`
- `listActiveEntries(doc.id)` 当前会返回 `late entry`

- [ ] **Step 4: 提交失败测试**

```bash
git add tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts
git commit -m "test: capture parse result deletion race regression"
```

---

## Task 3: 实现共享的“可见分录”条件，统一设置页和明细页口径

**Files:**
- Create: `src/modules/ledger/application/queries/ledger-entry-visibility.ts`
- Modify: `src/modules/ledger/application/queries/build-ledger-entry-filters.ts:1-60`
- Modify: `src/modules/ledger/application/use-cases/list-entry-categories-with-count.ts:14-21`

- [ ] **Step 1: 新建 `ledger-entry-visibility.ts`，把 “可见分录” 条件抽出来**

```typescript
import { isNull, or, sql, type SQL } from "drizzle-orm";
import { ledgerEntries } from "@/persistence";
import { sourceDocumentNotDeletedCondition } from "@/modules/source-document/application/source-document-state";

export function visibleLedgerEntryCondition(ledgerId: string): SQL<unknown> {
  return or(
    isNull(ledgerEntries.sourceDocumentId),
    sql`${ledgerEntries.sourceDocumentId} IN (
      SELECT id
      FROM source_documents
      WHERE ledger_id = ${ledgerId}
        AND ${sourceDocumentNotDeletedCondition()}
    )`
  )!;
}
```

- [ ] **Step 2: 在 `build-ledger-entry-filters.ts` 里把这个条件作为基础过滤条件**

把：

```typescript
if (q.whereActive != null) {
  conditions.push(q.whereActive);
}
```

改成：

```typescript
if (q.whereActive != null) {
  conditions.push(q.whereActive);
}
conditions.push(visibleLedgerEntryCondition(ledgerId));
```

并保留现有 start/end date 子查询，让“有日期时继续按 entry_date 过滤；没日期时也照样排除 deleted source document”。

- [ ] **Step 3: 在 `list-entry-categories-with-count.ts` 里复用同一个 helper**

把：

```typescript
.where(and(eq(ledgerEntries.ledgerId, ledgerId), isNull(ledgerEntries.deletedAt)))
```

改成：

```typescript
.where(
  and(
    eq(ledgerEntries.ledgerId, ledgerId),
    isNull(ledgerEntries.deletedAt),
    visibleLedgerEntryCondition(ledgerId)
  )
)
```

- [ ] **Step 4: 运行 Task 1 的测试，确认口径统一后通过**

Run:

```bash
npx vitest run --config vitest.integration.config.ts \
  tests/integration/ledger/category-actions.test.ts \
  tests/integration/api/ledger-entries.test.ts
```

Expected:

- `PASS`
- 分类计数只统计用户可见分录
- 明细列表在不传日期过滤时也不会返回 deleted source document 下的分录

- [ ] **Step 5: 提交查询口径修复**

```bash
git add \
  src/modules/ledger/application/queries/ledger-entry-visibility.ts \
  src/modules/ledger/application/queries/build-ledger-entry-filters.ts \
  src/modules/ledger/application/use-cases/list-entry-categories-with-count.ts
git commit -m "fix: align category counts with visible ledger entries"
```

---

## Task 4: 把 parse completion 改成事务内先确认 document 可写，再替换 entries

**Files:**
- Modify: `src/modules/source-document/application/parse-source-document/parse-result-handler.ts:92-103`

- [ ] **Step 1: 把事务顺序改成先更新 document，再替换 entries**

把当前事务：

```typescript
db.transaction((tx) => {
  replaceSourceDocumentLedgerEntries(tx, ledgerId, sourceDocumentId, entriesToInsert);

  tx.update(sourceDocuments)
    .set({
      status: "completed",
      ...(title != null && title !== "" ? { title } : {}),
    })
    .where(whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId))
    .run();
});
```

改成：

```typescript
db.transaction((tx) => {
  const completedResult = tx
    .update(sourceDocuments)
    .set({
      status: "completed",
      ...(title != null && title !== "" ? { title } : {}),
    })
    .where(whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId))
    .run();

  if (completedResult.changes === 0) {
    return;
  }

  replaceSourceDocumentLedgerEntries(tx, ledgerId, sourceDocumentId, entriesToInsert);
});
```

- [ ] **Step 2: 给这段逻辑补一句简短注释，明确这里是在堵删除竞态**

```typescript
// Guard against delete/parse races: only rewrite entries if the document is still active.
```

- [ ] **Step 3: 运行 Task 2 的竞态测试，确认脏 entry 不再写入**

Run:

```bash
npx vitest run --config vitest.unit.config.ts \
  tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts
```

Expected:

- `PASS`
- 删除后的 document 不会再留下活跃 entries

- [ ] **Step 4: 顺带运行 source document 删除相关集成测试，确认没有把正常删除流程打坏**

Run:

```bash
npx vitest run --config vitest.integration.config.ts \
  tests/integration/api/source-documents.test.ts \
  tests/integration/api/source-document-delete-race-condition.test.ts
```

Expected:

- `PASS`
- 正常删除仍会软删关联 entries
- 删除幂等性行为保持不变

- [ ] **Step 5: 提交竞态修复**

```bash
git add src/modules/source-document/application/parse-source-document/parse-result-handler.ts
git commit -m "fix: prevent parse completion from restoring deleted source document entries"
```

---

## Task 5: 用 migration 回填现有脏数据，并把回填结果纳入测试和 SQL 审计

**Files:**
- Create: `src/persistence/migrations/0029_soft_delete_entries_under_deleted_source_documents.sql`
- Create: `tests/integration/persistence/deleted-source-document-ledger-entry-migration.test.ts`
- Modify: `src/persistence/migrations/meta/_journal.json`

- [ ] **Step 1: 新增 SQL migration，软删所有挂在已删除 source document 下的活跃 entries**

```sql
UPDATE ledger_entries
SET
  deleted_at = COALESCE(
    (
      SELECT COALESCE(source_documents.deleted_at, source_documents.updated_at)
      FROM source_documents
      WHERE source_documents.id = ledger_entries.source_document_id
    ),
    CAST(unixepoch('now') * 1000 AS INTEGER)
  ),
  updated_at = COALESCE(
    (
      SELECT COALESCE(source_documents.updated_at, source_documents.deleted_at)
      FROM source_documents
      WHERE source_documents.id = ledger_entries.source_document_id
    ),
    updated_at
  )
WHERE deleted_at IS NULL
  AND source_document_id IN (
    SELECT id
    FROM source_documents
    WHERE status = 'deleted'
);
```

并在 `beforeEach()` 里给其它测试恢复默认实现：

```typescript
beforeEach(async () => {
  vi.clearAllMocks();
  const actual = await vi.importActual<
    typeof import("@/modules/source-document/application/parse-source-document/entry-builder")
  >("@/modules/source-document/application/parse-source-document/entry-builder");
  buildEntriesForInsertMock.mockImplementation(actual.buildEntriesForInsert);
});
```

- [ ] **Step 2: 在 `_journal.json` 里追加 migration 条目**

新增一条：

```json
{
  "idx": 29,
  "version": "6",
  "when": 1774310400000,
  "tag": "0029_soft_delete_entries_under_deleted_source_documents",
  "breakpoints": true
}
```

- [ ] **Step 3: 新建 migration 测试，验证脏 entry 会被软删**

```typescript
it("soft deletes active ledger entries that belong to deleted source documents", async () => {
  const db = getTestDb();
  const { ledgerId } = await createTestUserWithLedger(db);

  const [doc] = await db
    .insert(sourceDocuments)
    .values({
      ledgerId,
      text: "deleted doc",
      status: "deleted",
      deletedAt: new Date("2026-03-24T10:00:00.000Z"),
      imageUrls: [],
      entryDate: "2026-03-24",
    })
    .returning();

  const [entry] = await db
    .insert(ledgerEntries)
    .values({
      ledgerId,
      sourceDocumentId: doc!.id,
      categoryId: null,
      amount: "10.00",
      currency: "CNY",
      itemName: "stale entry",
    })
    .returning();

  const migrationSql = readFileSync(
    "src/persistence/migrations/0029_soft_delete_entries_under_deleted_source_documents.sql",
    "utf8"
  );

  (db as typeof db & { $client: { exec: (sql: string) => unknown } }).$client.exec(migrationSql);

  const migrated = await db.query.ledgerEntries.findFirst({
    where: eq(ledgerEntries.id, entry!.id),
  });

  expect(migrated?.deletedAt).not.toBeNull();
});
```

- [ ] **Step 4: 运行 migration 测试**

Run:

```bash
npx vitest run --config vitest.integration.config.ts \
  tests/integration/persistence/deleted-source-document-ledger-entry-migration.test.ts
```

Expected:

- `PASS`
- migration 执行后，脏 entry 不再是活跃状态

- [ ] **Step 5: 提交 migration**

```bash
git add \
  src/persistence/migrations/0029_soft_delete_entries_under_deleted_source_documents.sql \
  src/persistence/migrations/meta/_journal.json \
  tests/integration/persistence/deleted-source-document-ledger-entry-migration.test.ts
git commit -m "fix: backfill entries linked to deleted source documents"
```

---

## Task 6: 做收尾验证，确保代码修复和数据库回填都落地

**Files:**
- Modify: none

- [ ] **Step 1: 跑本次修复的目标测试集合**

Run:

```bash
npx vitest run --config vitest.integration.config.ts \
  tests/integration/ledger/category-actions.test.ts \
  tests/integration/api/ledger-entries.test.ts \
  tests/integration/api/source-documents.test.ts \
  tests/integration/api/source-document-delete-race-condition.test.ts \
  tests/integration/persistence/deleted-source-document-ledger-entry-migration.test.ts \
  tests/integration/modules/stats/application/queries/get-enhanced-stats.test.ts
```

Run:

```bash
npx vitest run --config vitest.unit.config.ts \
  tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts
```

Expected:

- `PASS`
- 相关查询、删除、stats、migration、parse race 回归全部通过

- [ ] **Step 2: 应用 migration 到本地开发数据库**

Run:

```bash
npm run db:migrate
```

Expected:

- migration 成功执行
- `data/sqlite.db` 中历史脏 entry 被软删

- [ ] **Step 3: 用 SQL 审计确认库里不再有“deleted source document + active entry”组合**

Run:

```bash
python - <<'PY'
import sqlite3
conn = sqlite3.connect("data/sqlite.db")
cur = conn.cursor()
cur.execute(
    '''
    SELECT COUNT(*)
    FROM ledger_entries e
    JOIN source_documents sd ON sd.id = e.source_document_id
    WHERE e.deleted_at IS NULL
      AND sd.status = 'deleted'
    '''
)
print(cur.fetchone()[0])
PY
```

Expected:

- 输出 `0`

- [ ] **Step 4: 再做一次用户问题的原始验证，确认“其他”不会再显示幽灵计数**

Run:

```bash
python - <<'PY'
import sqlite3
conn = sqlite3.connect("data/sqlite.db")
cur = conn.cursor()
cur.execute(
    '''
    SELECT c.name, COUNT(e.id)
    FROM entry_categories c
    LEFT JOIN ledger_entries e
      ON e.category_id = c.id
     AND e.deleted_at IS NULL
     AND (
       e.source_document_id IS NULL OR e.source_document_id IN (
         SELECT id
         FROM source_documents
         WHERE ledger_id = c.ledger_id
           AND status != 'deleted'
           AND deleted_at IS NULL
       )
     )
    WHERE c.ledger_id = '60c23df7-004a-4228-a2fb-7f161588fabc'
      AND c.name = '其他'
      AND c.deleted_at IS NULL
    GROUP BY c.name
    '''
)
print(cur.fetchall())
PY
```

Expected:

- 如果那 4 条全都来自 deleted source documents，结果应为 `('其他', 0)`
- 设置页分类数与明细可见数据重新一致

- [ ] **Step 5: 提交验证通过后的收尾 commit**

```bash
git add \
  src/modules/ledger/application/queries/ledger-entry-visibility.ts \
  src/modules/ledger/application/queries/build-ledger-entry-filters.ts \
  src/modules/ledger/application/use-cases/list-entry-categories-with-count.ts \
  src/modules/source-document/application/parse-source-document/parse-result-handler.ts \
  src/persistence/migrations/0029_soft_delete_entries_under_deleted_source_documents.sql \
  src/persistence/migrations/meta/_journal.json \
  tests/integration/ledger/category-actions.test.ts \
  tests/integration/api/ledger-entries.test.ts \
  tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts \
  tests/integration/persistence/deleted-source-document-ledger-entry-migration.test.ts
git commit -m "test: verify deleted source document entry consistency end to end"
```

---

## Notes For Implementers

- 这份计划默认遵循 `@test-driven-development`：先红灯复现，再最小修复，再回归验证。
- 执行完成前必须跑 `@verification-before-completion`，尤其是 migration 后的 SQL 审计，不能只看 UI。
- 如果 `Task 3` 做完后发现 `stats` 或 `export` 有新的失败，不要临时绕过；先确认它们是否也应该统一到 `visibleLedgerEntryCondition()`，再决定是否扩展范围。
- 如果本地 `data/sqlite.db` 已被其他 AI 或用户改动，先重新跑 Task 6 的 SQL 审计，不要假设库状态和计划编写时一致。
