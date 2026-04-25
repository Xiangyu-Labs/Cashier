# Source Document Backend Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate source-document retry/delete lifecycle orchestration behind shared backend primitives so clone, cancel, soft-delete, and resubmit behavior stays consistent.

**Architecture:** Keep this workstream strictly backend-only. Extract lifecycle primitives into one service under `application/services/`, then refactor `retry-source-document.ts`, `batch-retry-source-documents.ts`, and `delete-source-document.ts` to compose those helpers instead of each re-implementing task cancellation and soft-delete sequencing. Pending-queue cancellation semantics remain owned by the separate flow plan, so this plan's fixtures and assertions stay scoped to running-task lifecycle behavior.

**Tech Stack:** TypeScript, Drizzle ORM, Vitest integration tests

---

## File Map

- Create: `src/modules/source-document/application/services/source-document-lifecycle.ts` - shared lifecycle primitives for collecting task runs, cancelling active work, cloning documents, and soft-deleting rows.
- Modify: `src/modules/source-document/application/use-cases/retry-source-document.ts` - refactor single-document retry to use the lifecycle primitives.
- Modify: `src/modules/source-document/application/use-cases/batch-retry-source-documents.ts` - refactor batch retry to use the same lifecycle primitives.
- Modify: `src/modules/source-document/application/use-cases/delete-source-document.ts` - refactor delete and batch delete to use the same cancellation and soft-delete primitives.
- Create: `tests/integration/modules/source-document/application/use-cases/retry-source-document.test.ts`
- Create: `tests/integration/modules/source-document/application/use-cases/delete-source-document.test.ts`

### Task 1: Lock the lifecycle contract with integration tests

**Files:**
- Create: `tests/integration/modules/source-document/application/use-cases/retry-source-document.test.ts`
- Create: `tests/integration/modules/source-document/application/use-cases/delete-source-document.test.ts`

- [ ] **Step 1: Write the failing integration tests**

```ts
it("retrySourceDocument clones the document, soft deletes the original, and soft deletes old task runs", async () => {
  await seedRunningTaskRunForSourceDocument(originalDocId);

  const result = await retrySourceDocument({
    ledgerId,
    ledger,
    sourceDocumentId: originalDocId,
  });

  expect(result.status).toBe("queued");
  expect(await getDocument(originalDocId)).toMatchObject({
    deletedAt: expect.any(Date),
  });
  expect(await getDocument(result.sourceDocumentId)).toMatchObject({
    status: "queued",
  });
  expect(await listActiveTaskRunsForSourceDocument(originalDocId)).toEqual([]);
});

it("deleteSourceDocument cancels active tasks, soft deletes entries, and soft deletes task runs", async () => {
  await seedRunningTaskRunForSourceDocument(sourceDocumentId);

  const result = await deleteSourceDocument({
    ledgerId,
    sourceDocumentId,
  });

  expect(result).toEqual({
    sourceDocumentId,
    deleted: true,
  });
  expect(await listActiveEntriesForSourceDocument(sourceDocumentId)).toEqual([]);
  expect(await listActiveTaskRunsForSourceDocument(sourceDocumentId)).toEqual([]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:integration -- tests/integration/modules/source-document/application/use-cases/retry-source-document.test.ts tests/integration/modules/source-document/application/use-cases/delete-source-document.test.ts`

Expected: FAIL until the lifecycle contract is explicitly captured and the helper seams exist.

- [ ] **Step 3: Add minimal test fixtures**

Implementation notes:

- Use the real test DB setup and seed source documents, task runs, and ledger entries.
- Seed `running` task runs only in this plan. Do not enqueue pending flow tasks here.
- Assert on persisted row state, not just returned DTOs.
- Keep one focused test per lifecycle branch instead of one giant scenario.

- [ ] **Step 4: Run the targeted tests**

Run: `npm run test:integration -- tests/integration/modules/source-document/application/use-cases/retry-source-document.test.ts tests/integration/modules/source-document/application/use-cases/delete-source-document.test.ts`

Expected: FAIL with current implementation gaps, but the tests should compile and exercise the real code path.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/modules/source-document/application/use-cases/retry-source-document.test.ts tests/integration/modules/source-document/application/use-cases/delete-source-document.test.ts
git commit -m "test: lock source document lifecycle contract"
```

### Task 2: Extract shared lifecycle primitives

**Files:**
- Create: `src/modules/source-document/application/services/source-document-lifecycle.ts`

- [ ] **Step 1: Write the failing service-level tests only if needed**

```ts
// Prefer integration-first coverage from Task 1.
// Only add unit tests for pure helpers extracted into this service.
```

- [ ] **Step 2: Run the lifecycle integration tests to confirm the current code still fails**

Run: `npm run test:integration -- tests/integration/modules/source-document/application/use-cases/retry-source-document.test.ts tests/integration/modules/source-document/application/use-cases/delete-source-document.test.ts`

Expected: FAIL.

- [ ] **Step 3: Write the minimal lifecycle service**

```ts
export async function listRelatedSourceDocumentTaskRuns(
  ledgerId: string,
  sourceDocumentIds: string[]
) {
  return db.query.taskRuns.findMany({
    where: and(
      isNull(taskRuns.deletedAt),
      eq(taskRuns.scopeId, ledgerId),
      eq(taskRuns.entityType, "source_document"),
      inArray(taskRuns.entityId, sourceDocumentIds)
    ),
  });
}

export async function cancelActiveSourceDocumentTaskRuns(taskIds: string[]) {
  const tasks = await db.query.taskRuns.findMany({
    where: and(
      isNull(taskRuns.deletedAt),
      inArray(taskRuns.id, taskIds),
      inArray(taskRuns.status, ["pending", "running"])
    ),
  });

  for (const task of tasks) {
    await cancelFlowTask(task.id);
  }
}

export function softDeleteSourceDocumentsAndTaskRuns(
  tx: SourceDocumentTransaction,
  ledgerId: string,
  sourceDocumentIds: string[],
  taskIds: string[]
) {
  softDeleteSourceDocumentLedgerEntries(tx, ledgerId, sourceDocumentIds);
  if (taskIds.length > 0) {
    tx.update(taskRuns).set({ deletedAt: new Date() }).where(inArray(taskRuns.id, taskIds)).run();
  }
  tx.update(sourceDocuments)
    .set(deletedSourceDocumentPatch())
    .where(and(whereSourceDocumentNotDeleted(ledgerId), inArray(sourceDocuments.id, sourceDocumentIds)))
    .run();
}
```

Implementation notes:

- Keep this service backend-only. Do not import any UI or query-cache code here.
- Prefer narrow helpers with obvious ownership over a generic “manager” object.
- Keep document cloning and task submission separate from soft-delete primitives.

- [ ] **Step 4: Run the targeted integration tests**

Run: `npm run test:integration -- tests/integration/modules/source-document/application/use-cases/retry-source-document.test.ts tests/integration/modules/source-document/application/use-cases/delete-source-document.test.ts`

Expected: Still FAIL until the use cases are refactored to use the new service.

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/application/services/source-document-lifecycle.ts
git commit -m "refactor: extract source document lifecycle primitives"
```

### Task 3: Refactor retry and batch retry to use the shared lifecycle service

**Files:**
- Modify: `src/modules/source-document/application/use-cases/retry-source-document.ts`
- Modify: `src/modules/source-document/application/use-cases/batch-retry-source-documents.ts`

- [ ] **Step 1: Run the retry-focused integration test**

Run: `npm run test:integration -- tests/integration/modules/source-document/application/use-cases/retry-source-document.test.ts`

Expected: FAIL.

- [ ] **Step 2: Refactor the use cases with the minimal shared flow**

```ts
const relatedTaskRuns = await listRelatedSourceDocumentTaskRuns(ledgerId, [sourceDocumentId]);
await cancelActiveSourceDocumentTaskRuns(relatedTaskRuns.map((task) => task.id));

db.transaction((tx) => {
  softDeleteSourceDocumentsAndTaskRuns(tx, ledgerId, [sourceDocumentId], relatedTaskRuns.map((task) => task.id));
});
```

For `batch-retry-source-documents.ts`, use the same pattern with the batched ID list after creating the replacement documents.

Implementation notes:

- Keep clone/create-new-document logic in the retry use cases, not in the lifecycle service.
- Reuse one task-context lookup per batch.
- Preserve current DTO responses and logging shape.

- [ ] **Step 3: Run the retry-focused tests**

Run: `npm run test:integration -- tests/integration/modules/source-document/application/use-cases/retry-source-document.test.ts`

Expected: PASS.

- [ ] **Step 4: Run the broader source-document integration set**

Run: `npm run test:integration -- tests/integration/modules/source-document/application/use-cases/retry-source-document.test.ts tests/integration/modules/source-document/application/tasks/parse-source-document.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/application/use-cases/retry-source-document.ts src/modules/source-document/application/use-cases/batch-retry-source-documents.ts
git commit -m "refactor: share source document retry lifecycle"
```

### Task 4: Refactor delete and batch delete to use the shared lifecycle service

**Files:**
- Modify: `src/modules/source-document/application/use-cases/delete-source-document.ts`

- [ ] **Step 1: Run the delete-focused integration test**

Run: `npm run test:integration -- tests/integration/modules/source-document/application/use-cases/delete-source-document.test.ts`

Expected: FAIL.

- [ ] **Step 2: Refactor delete and batch delete**

```ts
const relatedTaskRuns = await listRelatedSourceDocumentTaskRuns(ledgerId, activeDocumentIds);
await cancelActiveSourceDocumentTaskRuns(relatedTaskRuns.map((task) => task.id));

db.transaction((tx) => {
  softDeleteSourceDocumentsAndTaskRuns(
    tx,
    ledgerId,
    activeDocumentIds,
    relatedTaskRuns.map((task) => task.id)
  );
});
```

Implementation notes:

- Keep the current idempotent return shape.
- Preserve the early return when there are no active documents.
- Do not reintroduce direct task-run update logic into this file after extraction.

- [ ] **Step 3: Run the targeted delete tests**

Run: `npm run test:integration -- tests/integration/modules/source-document/application/use-cases/delete-source-document.test.ts`

Expected: PASS.

- [ ] **Step 4: Run the full lifecycle test set**

Run: `npm run test:integration -- tests/integration/modules/source-document/application/use-cases/retry-source-document.test.ts tests/integration/modules/source-document/application/use-cases/delete-source-document.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/application/use-cases/delete-source-document.ts
git commit -m "refactor: share source document delete lifecycle"
```
