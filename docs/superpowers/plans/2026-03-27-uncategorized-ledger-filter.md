# Ledger Entry Uncategorized Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the ledger entry listing action so the `__uncategorized__` sentinel filters entries whose `category_id` is `NULL` while keeping UUID filters untouched.

**Architecture:** The ledger entry query layer already brands filters via `build-ledger-entry-filters.ts` and materializes them in `list-ledger-entries.ts`; we will add a filter path for the uncategorized sentinel and update the integration test so it fails until the query conversion uses `isNull` semantics.

**Tech Stack:** TypeScript, Drizzle query builder, Vitest integration suite.

---

### Task 1: Integration coverage for uncategorized filter

**Files:**
- Modify: `tests/integration/ledger/entry-actions.test.ts`
- Test: same file (integration test harness already exists)

- [ ] **Step 1: Write the failing test**

Extend the existing entry action tests to seed exactly two entries (one with `categoryId` null, one with a real category UUID) and then call the public list entry action with the filter that passes `details.categoryId = '__uncategorized__'`.

```ts
it('only returns uncategorized entries when filtering with __uncategorized__', async () => {
  // seed entries: one with ledgerEntries.categoryId = null, one with UUID
  const response = await callListEntriesAction({ details: { categoryId: '__uncategorized__' } });
  expect(response.entries).toEqual([{ id: uncategorizedEntry.id }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config vitest.integration.config.ts tests/integration/ledger/entry-actions.test.ts`
Expected: FAIL in the new `__uncategorized__` case because the query still expects a UUID.

### Task 2: Normalize filters and translate to SQL

**Files:**
- Modify: `src/modules/ledger/application/queries/build-ledger-entry-filters.ts`
- Modify: `src/modules/ledger/application/queries/list-ledger-entries.ts`
- Review: `src/modules/ledger/contract-schemas.ts` (no edits unless absolutely needed)

- [ ] **Step 3: Write minimal implementation**

1. In `build-ledger-entry-filters.ts`, enhance the category filter builder to recognize the sentinel `__uncategorized__` (or maybe `filters.categoryId === '__uncategorized__'`) and return a query filter that indicates a `null` comparison, while keeping existing UUID equality logic intact.
2. Update `list-ledger-entries.ts` so the Drizzle query builder applies `isNull(ledgerEntries.categoryId)` when it receives that sentinel from the normalized filters instead of equality.
3. Ensure all additions stay within the query layer; UI/contract code still just passes the sentinel string.

Implementation sketch:
```ts
if (filters.categoryId === '__uncategorized__') {
  return ledgerEntries.categoryId == null; // or isNull helper
}
return eq(ledgerEntries.categoryId, filters.categoryId);
```

### Task 3: Verify and commit

**Files:**
- Same three files touched above

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm vitest run --config vitest.integration.config.ts tests/integration/ledger/entry-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/ledger/entry-actions.test.ts \
  src/modules/ledger/application/queries/build-ledger-entry-filters.ts \
  src/modules/ledger/application/queries/list-ledger-entries.ts
git commit -m "feat: support uncategorized entry filtering"
```

