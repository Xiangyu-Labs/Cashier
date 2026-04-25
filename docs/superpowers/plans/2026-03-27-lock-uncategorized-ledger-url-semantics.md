I'm using the writing-plans skill to create the implementation plan.

# Lock down uncategorized ledger URL semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the ledger filter URL helpers round-trip the `__uncategorized__` sentinel as a real category filter instead of treating it as “no filter.”

**Architecture:** Adjust the focused ledger URL helpers to stop deleting or dropping the sentinel when building or updating URLs, and prove the behavior with unit tests that cover write, read, and unrelated updates. Keep the changes constrained to `ledger-url-params` helpers and their unit test.

**Tech Stack:** TypeScript, Vitest, browser URLSearchParams helpers.

---

### Task 1: Ledger URL uncategorized semantics

**Files:**
- Modify: `tests/unit/workspace/ledger-url-params.test.ts`
- Modify: `src/modules/workspace/ledger-url-params.ts`

- [ ] **Step 1: Write the failing test scenario**

```ts
it("preserves __uncategorized__ when writing category filters", () => {
  const params = updateLedgerSearchParams(new URLSearchParams("categoryId=old"), {
    categoryId: "__uncategorized__",
  });

  expect(params.toString()).toContain("categoryId=__uncategorized__");
});

it("reads __uncategorized__ back from the URL", () => {
  const filters = readLedgerFilterParams(
    new URLSearchParams("categoryId=__uncategorized__&currency=USD")
  );

  expect(filters.categoryId).toBe("__uncategorized__");
});

it("doesn’t drop uncategorized when unrelated params change", () => {
  const params = updateLedgerSearchParams(
    new URLSearchParams("categoryId=__uncategorized__"),
    { currency: "EUR" }
  );

  expect(params.toString()).toContain("categoryId=__uncategorized__");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/workspace/ledger-url-params.test.ts`
Expected: FAIL because `setOrDeleteStringParam` still removes the `__uncategorized__` param.

- [ ] **Step 3: Implement the minimal fix**

1. Update `setOrDeleteStringParam` so it only deletes when the value is `null`, `undefined`, or empty, but not when it is `__uncategorized__`.
2. Ensure `updateLedgerSearchParams` still calls this helper for `categoryId` so that the sentinel is written verbatim.
3. Verify that `readLedgerFilterParams` continues to return the raw `categoryId` string, letting callers detect `__uncategorized__`.

- [ ] **Step 4: Run tests to confirm the sentinel now survives the URL helpers**

Run: `pnpm vitest run tests/unit/workspace/ledger-url-params.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the change**

```bash
git add tests/unit/workspace/ledger-url-params.test.ts src/modules/workspace/ledger-url-params.ts
git commit -m "test: lock uncategorized ledger URL semantics"
```
