# Test Gates And Regression Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make coverage a working quality gate and close the highest-value missing regression tests around optimistic cache helpers, upload route security, and parse persistence helpers.

**Architecture:** Repair the coverage entrypoint first so the signal is trustworthy, then replace pseudo-regression tests with direct production-code tests, and finally add targeted boundary tests at the route/helper seams where regressions are most expensive.

**Tech Stack:** Vitest, Node scripts, TypeScript, TanStack Query, Next route handlers

---

## File Map

- Create: `scripts/run-test-coverage.mjs` - pre-create the coverage temp directory and delegate to Vitest.
- Modify: `package.json` - route `test:coverage` through the new script and add coverage to `check`.
- Modify: `vitest.shared.config.ts` - add `all`, `include`, `reportsDirectory`, and concrete thresholds.
- Create: `tests/unit/modules/task-queue/ui/taskQueueOptimistic.test.ts`
- Create: `tests/unit/modules/ledger/hooks/useLedgerEntriesMutations.test.ts`
- Create: `tests/unit/modules/source-document/hooks/useBatchSourceDocumentActions.test.ts`
- Delete: `tests/unit/hooks/use-task-queue-mutations.test.ts`
- Delete: `tests/unit/hooks/use-ledger-entries-mutations.test.ts`
- Delete: `tests/unit/hooks/use-batch-source-document-actions.test.ts`
- Modify: `tests/tooling/legacy-unit-test-allowlist.ts`
- Modify: `tests/integration/api/uploads-route.test.ts`
- Create: `tests/unit/modules/source-document/application/parse-source-document/entry-builder.test.ts`
- Create: `tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts`

### Task 1: Repair the coverage command and gate it in `check`

**Files:**
- Create: `scripts/run-test-coverage.mjs`
- Modify: `package.json`
- Modify: `vitest.shared.config.ts`

- [ ] **Step 1: Write the failing coverage smoke check**

```bash
npm run test:coverage
```

Expected: FAIL with `ENOENT ... coverage/.tmp/coverage-*.json`.

- [ ] **Step 2: Write the minimal coverage runner and thresholds**

```js
// scripts/run-test-coverage.mjs
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

mkdirSync(new URL("../coverage/.tmp", import.meta.url), { recursive: true });

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(command, ["vitest", "run", "--config", "vitest.config.ts", "--coverage"], {
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
```

```ts
// vitest.shared.config.ts
export const coverageConfig = {
  provider: "v8" as const,
  reporter: ["text", "json", "html"],
  reportsDirectory: "./coverage",
  all: true,
  include: ["src/**/*.ts", "src/**/*.tsx"],
  thresholds: {
    lines: 70,
    statements: 70,
    functions: 70,
    branches: 60,
  },
  exclude: ["node_modules", ".next", "tests", "src/**/*.test.ts", "src/**/*.test.tsx"],
};
```

```json
{
  "scripts": {
    "check": "npm run lint && npm run tsc && npm run test:unit && npm run test:integration && npm run test:coverage && npm run build && npm run validate:i18n",
    "test:coverage": "node scripts/run-test-coverage.mjs"
  }
}
```

- [ ] **Step 3: Run the coverage command to verify it passes**

Run: `npm run test:coverage`

Expected: PASS with text coverage output and generated `coverage/index.html`.

- [ ] **Step 4: Run the full `check` command**

Run: `npm run check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-test-coverage.mjs package.json vitest.shared.config.ts
git commit -m "build: gate coverage in check"
```

### Task 2: Replace pseudo-regression tests with direct production-code tests

**Files:**
- Create: `tests/unit/modules/task-queue/ui/taskQueueOptimistic.test.ts`
- Create: `tests/unit/modules/ledger/hooks/useLedgerEntriesMutations.test.ts`
- Create: `tests/unit/modules/source-document/hooks/useBatchSourceDocumentActions.test.ts`
- Delete: `tests/unit/hooks/use-task-queue-mutations.test.ts`
- Delete: `tests/unit/hooks/use-ledger-entries-mutations.test.ts`
- Delete: `tests/unit/hooks/use-batch-source-document-actions.test.ts`
- Modify: `tests/tooling/legacy-unit-test-allowlist.ts`

- [ ] **Step 1: Write the replacement tests against production code**

```ts
// tests/unit/modules/task-queue/ui/taskQueueOptimistic.test.ts
import {
  removeItemsById,
  removeItemsBySourceDocId,
  markItemsPendingBySourceDocId,
} from "@/modules/task-queue/ui/taskQueueOptimistic";

it("returns old data when task queue items are missing", () => {
  expect(removeItemsById({ stats: { total: 5 } } as never, ["task-1"])).toEqual({
    stats: { total: 5 },
  });
});

it("marks matching source-document tasks as pending", () => {
  expect(
    markItemsPendingBySourceDocId(
      {
        items: [{ id: "task-1", sourceDocumentId: "doc-1", status: "failed" }],
        stats: { total: 1 },
      },
      ["doc-1"]
    )
  ).toMatchObject({
    items: [{ status: "pending" }],
  });
});
```

Use the same pattern for:

- `useLedgerEntriesMutations` by importing the real hook and asserting the captured `onOptimisticUpdate`
- `useBatchSourceDocumentActions` by importing the real hook and asserting it handles missing `items` safely

- [ ] **Step 2: Run the new tests to verify they fail before implementation cleanup**

Run: `npm run test:unit -- tests/unit/modules/task-queue/ui/taskQueueOptimistic.test.ts tests/unit/modules/ledger/hooks/useLedgerEntriesMutations.test.ts tests/unit/modules/source-document/hooks/useBatchSourceDocumentActions.test.ts`

Expected: FAIL until the assertions are pointed at real production helpers/hooks and the legacy pseudo-tests are removed.

- [ ] **Step 3: Remove the pseudo-tests and shrink the legacy allowlist**

Implementation notes:

- Delete the three legacy `tests/unit/hooks/*` pseudo-regression files.
- Remove their paths from `tests/tooling/legacy-unit-test-allowlist.ts`.
- Keep the new module-scoped tests under `tests/unit/modules/*` so the governance rule moves in the right direction.

- [ ] **Step 4: Run the targeted unit and governance tests**

Run: `npm run test:unit -- tests/unit/modules/task-queue/ui/taskQueueOptimistic.test.ts tests/unit/modules/ledger/hooks/useLedgerEntriesMutations.test.ts tests/unit/modules/source-document/hooks/useBatchSourceDocumentActions.test.ts tests/unit/tooling/unit-test-location-governance.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/modules/task-queue/ui/taskQueueOptimistic.test.ts tests/unit/modules/ledger/hooks/useLedgerEntriesMutations.test.ts tests/unit/modules/source-document/hooks/useBatchSourceDocumentActions.test.ts tests/tooling/legacy-unit-test-allowlist.ts
git rm tests/unit/hooks/use-task-queue-mutations.test.ts tests/unit/hooks/use-ledger-entries-mutations.test.ts tests/unit/hooks/use-batch-source-document-actions.test.ts
git commit -m "test: replace pseudo regression tests"
```

### Task 3: Cover the upload route security and error matrix

**Files:**
- Modify: `tests/integration/api/uploads-route.test.ts`

- [ ] **Step 1: Write the missing route tests**

```ts
it.each([
  [["..", "doc", "a.jpg"]],
  [["ledger", ".", "a.jpg"]],
  [["ledger", "doc", "..\\\\a.jpg"]],
  [["/ledger", "doc", "a.jpg"]],
])("returns 404 for invalid path segments: %j", async (pathSegments) => {
  const response = await uploadsGET(createMockRequest("http://localhost/api/uploads/test"), {
    params: Promise.resolve({ path: pathSegments }),
  });

  expect(response.status).toBe(404);
});

it("returns 404 when storage reports file not found", async () => {
  mockDownload.mockRejectedValueOnce(new Error("File not found"));
  const response = await uploadsGET(...);
  expect(response.status).toBe(404);
});

it("returns 500 for unexpected storage errors", async () => {
  mockDownload.mockRejectedValueOnce(new Error("boom"));
  const response = await uploadsGET(...);
  expect(response.status).toBe(500);
});

it("sets content headers for successful image responses", async () => {
  mockDownload.mockResolvedValueOnce(Buffer.from("image"));
  const response = await uploadsGET(...);
  expect(response.headers.get("Content-Type")).toBe("image/jpeg");
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
});
```

- [ ] **Step 2: Run the route test to verify it fails**

Run: `npm run test:integration -- tests/integration/api/uploads-route.test.ts`

Expected: FAIL until the new cases are added and any missing mocks/fixtures are wired correctly.

- [ ] **Step 3: Fill in the missing request fixtures only**

Implementation notes:

- Reuse the existing `createTestUserWithLedger()` setup.
- Do not mock the route internals differently per case; drive the real handler with different `params` and storage failures.
- Keep each case explicit instead of one giant table-driven helper.

- [ ] **Step 4: Run the targeted integration test**

Run: `npm run test:integration -- tests/integration/api/uploads-route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/api/uploads-route.test.ts
git commit -m "test: cover uploads route security branches"
```

### Task 4: Add direct tests for parse persistence helpers

**Files:**
- Create: `tests/unit/modules/source-document/application/parse-source-document/entry-builder.test.ts`
- Create: `tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
it("maps categoryIndex, fallback item name, and conversion failures safely", async () => {
  convertEntryAmountMock.mockRejectedValueOnce(new Error("rate unavailable"));

  const result = await buildEntriesForInsert({
    validEntries: [
      {
        amount: 10,
        currency: "USD",
        categoryIndex: 1,
        itemName: "",
        notes: null,
      },
    ],
    categories: [{ id: "cat-1", name: "Food", description: null }],
    sourceDocumentId: "doc-1",
    ledgerId: "ledger-1",
    mainCurrency: "CNY",
    fallbackDate: "2026-03-20",
  });

  expect(result[0]).toMatchObject({
    categoryId: "cat-1",
    itemName: "Uncategorized",
    convertedAmount: null,
    exchangeRate: null,
  });
});

it("marks invalid parse results as anomaly and does not save entries", async () => {
  await handleParseResult({
    ledgerId,
    sourceDocumentId,
    parsedEntries: [{ amount: 0, currency: "unknown", itemName: "bad", categoryIndex: 0 }],
    verificationStatus: "passed",
    categories: [],
  });

  expect(await getSourceDocument(sourceDocumentId)).toMatchObject({
    status: "anomaly",
  });
  expect(await listEntriesForSourceDocument(sourceDocumentId)).toEqual([]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/entry-builder.test.ts tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts`

Expected: FAIL because these helper branches are not tested directly yet.

- [ ] **Step 3: Add only the missing mocks and fixtures**

Implementation notes:

- Mock `convertEntryAmount()` directly in the `entry-builder` test.
- Use the test DB setup in `parse-result-handler.test.ts` so you assert actual status and row writes.
- Cover `verificationStatus: "anomaly"`, validation failure, and success with one converted and one main-currency entry.

- [ ] **Step 4: Run the targeted tests**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/parse-source-document/entry-builder.test.ts tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/modules/source-document/application/parse-source-document/entry-builder.test.ts tests/unit/modules/source-document/application/parse-source-document/parse-result-handler.test.ts
git commit -m "test: cover parse persistence helpers"
```
