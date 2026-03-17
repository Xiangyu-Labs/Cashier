# 修复删除操作幂等性问题实施计划

> **For agentic workers:** REQUIRED: Use @superpowers-extended-cc:subagent-driven-development or @superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `deleteSourceDocumentAction` 和 `deleteLedgerAction`，使其支持幂等删除——删除已软删除的记录时不抛出 `NotFoundError`，而是静默成功。

**Architecture:** 将"先查询再删除"模式改为"直接执行软删除"模式。删除已软删除的记录是幂等操作，目标状态（记录已删除）已经达成，因此不应报错。

**Tech Stack:** TypeScript, Next.js Server Actions, Drizzle ORM, better-sqlite3, Vitest

---

## 问题背景

用户在"流水"页面删除记录时，如果该记录已被软删除（如竞态条件或重复点击），会显示"删除失败"。但刷新后记录已消失，造成困惑。

**根因分析：**
- `deleteSourceDocumentAction` (line 136-142): 使用 `findFirst({ where: and(q.whereActive, q.whereId(sourceId)) })` 查询记录，如果已软删除则返回 null，随后抛出 `NotFoundError`
- `deleteLedgerAction` (line 18-24): 同样使用 `findFirst({ where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)) })`，已软删除的账本返回 null，抛出 `NotFoundError`

**正确行为：**
- `deleteLedgerEntryAction` 和 `deleteEntryCategoryAction`: 直接执行 `update().set(softDelete)`，无需查询，天然幂等

---

## Chunk 1: 修复 deleteSourceDocumentAction

### Task 1.1: 验证当前测试失败

**Files:**
- Test: `tests/integration/api/source-document-delete-idempotency.test.ts`

- [ ] **Step 1: 运行现有测试确认失败**

```bash
npx vitest run tests/integration/api/source-document-delete-idempotency.test.ts --reporter=verbose
```

**Expected:** 至少 2 个测试失败，错误为 `NotFoundError: Source document not found`

---

### Task 1.2: 修改 deleteSourceDocumentAction 实现

**Files:**
- Modify: `src/features/source-document/server/actions/delete.ts:131-161`

- [ ] **Step 1: 修改删除逻辑，移除 NotFoundError 检查**

将代码从：
```typescript
export const deleteSourceDocumentAction = withLedgerAccess(
  async (ledgerId: string, sourceId: string): Promise<void> => {
    const q = forLedger(sourceDocuments, ledgerId);

    // Get source document to retrieve image URLs before deletion
    const sourceDoc = await db.query.sourceDocuments.findFirst({
      where: and(q.whereActive, q.whereId(sourceId)),
    });

    if (!sourceDoc) {
      throw new NotFoundError("Source document not found");
    }

    // Find and cancel related tasks
    const relatedTaskRuns = await getRelatedTaskRuns(ledgerId, [sourceId]);
    await cancelRunningTasks(relatedTaskRuns.map((t) => t.id));
    const taskIdsToDelete = relatedTaskRuns.map((task) => task.id);

    // Execute soft delete transaction
    db.transaction((tx) => {
      softDeleteLedgerEntries(tx, ledgerId, [sourceId]);
      softDeleteTaskRuns(tx, taskIdsToDelete);
      softDeleteSourceDocuments(tx, ledgerId, [sourceId]);
    });

    // Delete images from local storage after successful soft delete
    if (sourceDoc.imageUrls != null && sourceDoc.imageUrls.length > 0) {
      await deleteLocalImages(sourceDoc.imageUrls);
    }
  }
);
```

改为：
```typescript
export const deleteSourceDocumentAction = withLedgerAccess(
  async (ledgerId: string, sourceId: string): Promise<void> => {
    const q = forLedger(sourceDocuments, ledgerId);

    // Get source document to retrieve image URLs before deletion
    // 注意：使用 NOT NULL 条件查询，包括已软删除的记录
    const sourceDoc = await db.query.sourceDocuments.findFirst({
      where: and(eq(sourceDocuments.ledgerId, ledgerId), q.whereId(sourceId)),
    });

    // 如果记录不存在（包括已软删除），静默成功（幂等）
    if (!sourceDoc) {
      return;
    }

    // 如果记录已软删除，也静默成功
    if (sourceDoc.deletedAt != null) {
      return;
    }

    // Find and cancel related tasks
    const relatedTaskRuns = await getRelatedTaskRuns(ledgerId, [sourceId]);
    await cancelRunningTasks(relatedTaskRuns.map((t) => t.id));
    const taskIdsToDelete = relatedTaskRuns.map((task) => task.id);

    // Execute soft delete transaction
    db.transaction((tx) => {
      softDeleteLedgerEntries(tx, ledgerId, [sourceId]);
      softDeleteTaskRuns(tx, taskIdsToDelete);
      softDeleteSourceDocuments(tx, ledgerId, [sourceId]);
    });

    // Delete images from local storage after successful soft delete
    if (sourceDoc.imageUrls != null && sourceDoc.imageUrls.length > 0) {
      await deleteLocalImages(sourceDoc.imageUrls);
    }
  }
);
```

**注意：** 需要在文件顶部添加 `eq` 导入：`import { and, eq, inArray, isNull } from "drizzle-orm";`

---

- [ ] **Step 2: 运行测试验证修复**

```bash
npx vitest run tests/integration/api/source-document-delete-idempotency.test.ts
```

**Expected:** 所有 4 个测试通过

---

- [ ] **Step 3: 提交更改**

```bash
git add src/features/source-document/server/actions/delete.ts
git commit -m "fix: make deleteSourceDocumentAction idempotent

Delete operations should be idempotent. When a record is already
soft-deleted (race condition), the operation should succeed silently
instead of throwing NotFoundError.

Fixes the issue where users see 'delete failed' but the record
is actually deleted after refresh."
```

---

## Chunk 2: 修复 deleteLedgerAction

### Task 2.1: 运行现有测试确认失败

**Files:**
- Test: `tests/integration/api/ledger-delete-idempotency.test.ts`

- [ ] **Step 1: 验证测试失败**

```bash
npx vitest run tests/integration/api/ledger-delete-idempotency.test.ts --reporter=verbose
```

**Expected:** 3 个测试失败，错误为 `NotFoundError: Ledger`

---

### Task 2.2: 修改 deleteLedgerAction 实现

**Files:**
- Modify: `src/features/ledger/server/actions/delete.ts:15-55`

- [ ] **Step 1: 修改删除逻辑，移除 NotFoundError 检查**

将代码从：
```typescript
export const deleteLedgerAction = withAuth(
  async (userId: string, ledgerId: string): Promise<void> => {
    // Verify ownership
    const existing = await db.query.ledgers.findFirst({
      where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
    });

    if (!existing) {
      throw new NotFoundError("Ledger");
    }

    if (existing.userId !== userId) {
      throw new ForbiddenError("Access denied to this ledger");
    }

    // ... rest of the function
  }
);
```

改为：
```typescript
export const deleteLedgerAction = withAuth(
  async (userId: string, ledgerId: string): Promise<void> => {
    // Verify ownership - 查询包括已软删除的记录
    const existing = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
    });

    // 如果账本不存在，抛出错误（不是幂等情况）
    if (!existing) {
      throw new NotFoundError("Ledger");
    }

    // 如果账本已软删除，静默成功（幂等）
    if (existing.deletedAt != null) {
      return;
    }

    if (existing.userId !== userId) {
      throw new ForbiddenError("Access denied to this ledger");
    }

    // ... rest of the function
  }
);
```

**关键变化：**
1. 移除 `isNull(ledgers.deletedAt)` 条件，查询所有记录
2. 添加 `existing.deletedAt != null` 检查，已软删除时直接返回
3. 保留 `NotFoundError` 用于真正不存在的账本（如新建的 ID）
4. 保留 `ForbiddenError` 用于权限检查

---

- [ ] **Step 2: 运行测试验证修复**

```bash
npx vitest run tests/integration/api/ledger-delete-idempotency.test.ts
```

**Expected:** 所有 4 个测试通过

---

- [ ] **Step 3: 提交更改**

```bash
git add src/features/ledger/server/actions/delete.ts
git commit -m "fix: make deleteLedgerAction idempotent

Delete operations should be idempotent. When a ledger is already
soft-deleted (race condition), the operation should succeed silently
instead of throwing NotFoundError.

Fixes the issue where users see 'delete failed' but the ledger
is actually deleted after refresh."
```

---

## Chunk 3: 回归测试

### Task 3.1: 运行所有相关测试

- [ ] **Step 1: 运行源文档相关测试**

```bash
npx vitest run tests/integration/api/source-document-delete-idempotency.test.ts tests/integration/api/source-document-delete-race-condition.test.ts
```

**Expected:** 全部通过

- [ ] **Step 2: 运行账本相关测试**

```bash
npx vitest run tests/integration/api/ledger-delete-idempotency.test.ts tests/integration/api/ledger-entry-delete.test.ts tests/unit/features/ledger/server/actions/delete.test.ts
```

**Expected:** 全部通过

- [ ] **Step 3: 运行完整测试套件**

```bash
npm run test:run
```

**Expected:** 无新增失败

---

- [ ] **Step 4: 提交最终变更**

```bash
git add tests/integration/api/source-document-delete-idempotency.test.ts tests/integration/api/ledger-delete-idempotency.test.ts
git commit -m "test: add idempotency tests for delete operations

Add tests to verify deleteSourceDocumentAction and deleteLedgerAction
are idempotent - deleting an already soft-deleted record should
succeed silently instead of throwing NotFoundError."
```

---

## Verification Checklist

实施完成后，确认以下场景正常工作：

- [ ] 重复删除同一条流水记录 → 成功（不报错）
- [ ] 删除已软删除的流水记录 → 成功（不报错）
- [ ] 并发删除同一条流水记录 → 都成功
- [ ] 重复删除同一个账本 → 成功（不报错）
- [ ] 删除已软删除的账本 → 成功（不报错）
- [ ] 删除真正不存在的账本（新 ID）→ 抛出 NotFoundError（正确行为）
- [ ] 删除没有权限的账本 → 抛出 ForbiddenError（正确行为）
- [ ] 正常删除未软删除的记录 → 正常工作

---

## Related Files

- **修改:**
  - `src/features/source-document/server/actions/delete.ts:131-161`
  - `src/features/ledger/server/actions/delete.ts:15-55`

- **测试（已存在，用于验证修复）:**
  - `tests/integration/api/source-document-delete-idempotency.test.ts`
  - `tests/integration/api/ledger-delete-idempotency.test.ts`

- **参考（正确实现模式）:**
  - `src/features/ledger/server/actions/entries.ts:172-176` (deleteLedgerEntryAction - 直接软删除，天然幂等)
  - `src/features/ledger/server/actions/categories.ts:101-141` (deleteEntryCategoryAction - 直接软删除，天然幂等)
