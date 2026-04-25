# Query Maintainability Follow-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the remaining source-document query monolith and consolidate workspace URL/filter orchestration without expanding the current stats architecture or introducing new generic abstractions.

**Architecture:** This plan is a follow-up to the source-document contract cleanup work and should be implemented on top of that branch or after it lands. Keep public module APIs stable, split `source-document-queries.ts` into focused query/condition files plus a thin compatibility barrel, and move duplicated workspace filter and URL-serialization logic into one small workspace-owned pure helper used by `usePeriodFilter`, `useDetailsTabFilters`, and `LedgerPageClient`. `get-enhanced-stats.ts` stays behaviorally unchanged in this batch, and the oversized hooks/components remain deferred unless a task here must touch them.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, Zod, TanStack Query, Vitest, ESLint

---

## Scope Check

This request spans four topics, but only two of them are actionable refactors that produce a clean, testable increment right now:

1. source-document query decomposition
2. workspace URL/filter orchestration consolidation

The other two topics are intentionally **deferred in this plan**:

- enhanced stats scalability: keep the current application-layer aggregation until real scale justifies SQL pushdown
- oversized hooks/components: split them only when a feature or bugfix already requires touching them

This plan therefore produces **two shippable PR tracks** and an explicit deferred-work section.

## Dependency Note

This plan assumes the earlier source-document contract cleanup plan has either:

- already landed on the target branch, or
- been rebased into the working branch before implementation begins

Reason: both plans touch the source-document query area, and this follow-up should not reintroduce the old ambiguous naming/contract surface.

## File Map

### Source-Document Query Track

- `src/modules/source-document/application/queries/source-document-queries.ts`
  - Shrink from monolith into a thin compatibility barrel that only re-exports focused query files. Do not keep logic here once the split is done.
- `src/modules/source-document/application/queries/source-document-query-status.ts`
  - Owns status condition construction only.
- `src/modules/source-document/application/queries/source-document-query-date.ts`
  - Owns entry-date range condition construction only.
- `src/modules/source-document/application/queries/source-document-query-amount.ts`
  - Owns amount-range condition construction only.
- `src/modules/source-document/application/queries/source-document-query-cursor.ts`
  - Owns cursor condition and next-cursor generation only.
- `src/modules/source-document/application/queries/list-source-document-page.ts`
  - Owns cursor-based page query and validated-input wrapper.
- `src/modules/source-document/application/queries/list-source-document-collection.ts`
  - Owns the bounded collection query used by the workspace stream after the contract cleanup plan.
- `src/modules/source-document/application/queries/get-pending-source-documents.ts`
  - Owns pending-group query assembly only.
- `src/modules/source-document/application/queries/get-source-document-full.ts`
  - Owns the full document lookup only.
- `src/modules/source-document/server-actions/queries.ts`
  - Keeps current public action boundary intact while updating imports to focused query files.
- `src/modules/source-document/queries.ts`
  - Public module read barrel. Keep this stable.
- `tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
  - Existing behavior-level safety net for the split.
- `tests/integration/source-document/source-document-query-actions.test.ts`
  - Existing action boundary tests. Extend if the split needs more import-surface safety.
- `tests/unit/modules/source-document/application/queries/get-pending-source-documents.test.ts`
  - New focused pending-query characterization test.
- `tests/unit/modules/source-document/application/queries/source-document-query-cursor.test.ts`
  - New focused cursor helper test.

### Workspace URL / Filter Track

- `src/modules/workspace/ledger-url-params.ts`
  - Remains the low-level URLSearchParams read/write helper.
- `src/modules/workspace/ledger-url-navigation.ts`
  - Remains the only browser URL write helper. Do not add another navigation utility.
- `src/modules/workspace/ledger-filter-state.ts`
  - New pure workspace helper for translating `PeriodParams` + advanced filters into `EntryFilters`, `filterKey`, and URL update payloads.
- `src/modules/workspace/hooks/usePeriodFilter.ts`
  - Should stop hand-encoding date/filter URL updates and delegate to the workspace helper.
- `src/modules/workspace/ui/useDetailsTabFilters.ts`
  - Should stop duplicating filter derivation and update splitting logic.
- `src/modules/workspace/ui/useLedgerEntriesFilters.ts`
  - Should reuse the same pure filter derivation rules instead of recomputing date filters separately.
- `src/modules/workspace/ui/LedgerPageClient.tsx`
  - Should stop creating a separate ad hoc `handleAdvancedFiltersChange` write path.
- `src/modules/workspace/ui/DetailsTab.tsx`
  - Should continue to consume a single coordinated filter/update contract from the parent/hook layer.
- `tests/unit/modules/workspace/ledger-filter-state.test.ts`
  - New pure helper tests for filter derivation and update splitting.
- `tests/unit/modules/workspace/hooks/usePeriodFilter.test.ts`
  - Existing hook safety net for URL writes.
- `tests/unit/hooks/useDetailsTabFilters.test.ts`
  - Existing hook safety net for advanced filter propagation.
- `tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx`
  - Existing orchestration test for URL replacement path.
- `tests/unit/modules/workspace/ui/LedgerEntriesTab.test.tsx`
  - Existing summary/source-document query alignment test after helper reuse.
- `tests/unit/workspace/ledger-url-params.test.ts`
  - Existing URL param helper tests.

## Non-Goals

- Do not redesign `get-enhanced-stats.ts` into SQL aggregation, pre-aggregation tables, or materialized views.
- Do not refactor `useSourceDocumentInputController.ts`, `useTaskQueueModal.ts`, `image-editor.tsx`, `SourceDocumentCard.tsx`, or `calculator-input.tsx` in this plan unless a task here is forced to touch one of them.
- Do not introduce a generic query framework, repository layer, state machine framework, or global filter orchestration layer.

## Deferred Work Rules

- If enhanced stats becomes slow in production, the next step is **SQL pushdown for the hottest aggregations**, not a new caching subsystem.
- If one of the oversized hooks/components is touched by future feature work, split only the local behavior being changed and prefer a small local hook or child component over a shared abstraction.

### Task 1: Add Characterization Tests For The Source-Document Split

**Files:**
- Create: `tests/unit/modules/source-document/application/queries/source-document-query-cursor.test.ts`
- Create: `tests/unit/modules/source-document/application/queries/get-pending-source-documents.test.ts`
- Modify: `tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`

- [ ] **Step 1: Write the failing cursor helper test**

```ts
import { describe, expect, it } from "vitest";
import { generateSourceDocumentNextCursor } from "@/modules/source-document/application/queries/source-document-query-cursor";

describe("source-document-query-cursor", () => {
  it("generates the next cursor from entryDate, createdAt, and id", () => {
    const cursor = generateSourceDocumentNextCursor({
      id: "doc-1",
      entryDate: "2026-03-23",
      createdAt: new Date("2026-03-23T10:00:00.000Z"),
    } as never);

    expect(cursor).toBe("2026-03-23|2026-03-23T10:00:00.000Z|doc-1");
  });
});
```

- [ ] **Step 2: Write the failing pending-query characterization test**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { getPendingSourceDocumentsQuery } from "@/modules/source-document/application/queries/get-pending-source-documents";

describe("getPendingSourceDocumentsQuery", () => {
  it("groups queued, processing, anomaly, and failed documents", async () => {
    const result = await getPendingSourceDocumentsQuery(ledgerId);

    expect(result.groups.queued).toHaveLength(1);
    expect(result.groups.processing).toHaveLength(1);
    expect(result.groups.anomaly).toHaveLength(1);
    expect(result.groups.failed).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run the new source-document query tests to verify they fail**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/queries/source-document-query-cursor.test.ts tests/unit/modules/source-document/application/queries/get-pending-source-documents.test.ts`
Expected: FAIL because the new focused query files do not exist yet.

- [ ] **Step 4: Add one extra integration assertion that protects the public query surface during the split**

```ts
it("returns pending groups through the public query barrel", async () => {
  const result = await getPendingSourceDocuments(ledgerId);
  expect(result.stats.total).toBeGreaterThan(0);
});
```

- [ ] **Step 5: Run the integration query suite to verify the new assertion currently fails**

Run: `npm run test:integration -- tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
Expected: PASS and establish the existing integration baseline before the refactor starts.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/modules/source-document/application/queries/source-document-query-cursor.test.ts \
  tests/unit/modules/source-document/application/queries/get-pending-source-documents.test.ts \
  tests/integration/modules/source-document/application/queries/source-document-queries.test.ts
git commit -m "test: characterize source-document query split"
```

### Task 2: Extract Source-Document Condition Helpers Into Focused Files

**Files:**
- Create: `src/modules/source-document/application/queries/source-document-query-status.ts`
- Create: `src/modules/source-document/application/queries/source-document-query-date.ts`
- Create: `src/modules/source-document/application/queries/source-document-query-amount.ts`
- Create: `src/modules/source-document/application/queries/source-document-query-cursor.ts`
- Modify: `src/modules/source-document/application/queries/source-document-queries.ts`

- [ ] **Step 1: Create the focused helper files with the current logic moved verbatim**

Use one responsibility per file:

```ts
// source-document-query-status.ts
export function buildSourceDocumentStatusCondition(...) { ... }

// source-document-query-date.ts
export function buildSourceDocumentDateConditions(...) { ... }

// source-document-query-amount.ts
export function buildSourceDocumentAmountConditions(...) { ... }

// source-document-query-cursor.ts
export function buildSourceDocumentCursorCondition(...) { ... }
export function generateSourceDocumentNextCursor(...) { ... }
```

- [ ] **Step 2: Replace the helper implementations in `source-document-queries.ts` with imports**

```ts
import { buildSourceDocumentStatusCondition } from "./source-document-query-status";
import { buildSourceDocumentDateConditions } from "./source-document-query-date";
import { buildSourceDocumentAmountConditions } from "./source-document-query-amount";
import {
  buildSourceDocumentCursorCondition,
  generateSourceDocumentNextCursor,
} from "./source-document-query-cursor";
```

- [ ] **Step 3: Run the focused unit tests to verify the helper extraction passes**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/queries/source-document-query-cursor.test.ts tests/unit/modules/source-document/application/queries/get-pending-source-documents.test.ts`
Expected: PASS

- [ ] **Step 4: Run the source-document integration tests to verify behavior is unchanged**

Run: `npm run test:integration -- tests/integration/modules/source-document/application/queries/source-document-queries.test.ts tests/integration/source-document/source-document-query-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/application/queries/source-document-query-status.ts \
  src/modules/source-document/application/queries/source-document-query-date.ts \
  src/modules/source-document/application/queries/source-document-query-amount.ts \
  src/modules/source-document/application/queries/source-document-query-cursor.ts \
  src/modules/source-document/application/queries/source-document-queries.ts
git commit -m "refactor: extract source-document query helpers"
```

### Task 3: Split The Remaining Source-Document Query Use Cases By Responsibility

**Files:**
- Create: `src/modules/source-document/application/queries/list-source-document-page.ts`
- Create: `src/modules/source-document/application/queries/list-source-document-collection.ts`
- Create: `src/modules/source-document/application/queries/get-pending-source-documents.ts`
- Create: `src/modules/source-document/application/queries/get-source-document-full.ts`
- Create: `tests/unit/modules/source-document/application/queries/focused-source-document-queries.test.ts`
- Modify: `src/modules/source-document/application/queries/source-document-queries.ts`
- Modify: `src/modules/source-document/server-actions/queries.ts`
- Modify: `src/modules/source-document/queries.ts`
- Modify: `tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
- Modify: `tests/integration/source-document/source-document-query-actions.test.ts`

- [ ] **Step 1: Write the failing export-surface test for the new focused query files**

```ts
import { describe, expect, it } from "vitest";
import { listSourceDocumentsQuery } from "@/modules/source-document/application/queries/list-source-document-page";
import { getPendingSourceDocumentsQuery } from "@/modules/source-document/application/queries/get-pending-source-documents";
import { getSourceDocumentFullQuery } from "@/modules/source-document/application/queries/get-source-document-full";

describe("focused source-document query files", () => {
  it("exports the focused query functions", () => {
    expect(typeof listSourceDocumentsQuery).toBe("function");
    expect(typeof getPendingSourceDocumentsQuery).toBe("function");
    expect(typeof getSourceDocumentFullQuery).toBe("function");
  });
});
```

- [ ] **Step 2: Run the focused source-document unit tests to verify the new files do not exist yet**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/queries/focused-source-document-queries.test.ts`
Expected: FAIL because the new query files/imports are not present yet.

- [ ] **Step 3: Move each query into its own file and turn `source-document-queries.ts` into a compatibility barrel**

Use this structure:

```ts
// source-document-queries.ts
export {
  listSourceDocumentsQuery,
  listSourceDocuments,
  listSourceDocumentsFromValidatedInput,
} from "./list-source-document-page";
export {
  getSourceDocumentCollection,
  getSourceDocumentCollectionFromValidatedInput,
} from "./list-source-document-collection";
export { getPendingSourceDocumentsQuery, getPendingSourceDocuments } from "./get-pending-source-documents";
export { getSourceDocumentFullQuery, getSourceDocumentFull } from "./get-source-document-full";
```

If the earlier contract-cleanup plan kept the old bounded collection names, adapt the barrel to its final merged names before proceeding. Do not reintroduce old ambiguous exports.

- [ ] **Step 4: Update the action/public barrels to import from the focused files or the compatibility barrel consistently**

Keep the module public API stable:

```ts
// server-actions/queries.ts
import {
  getPendingSourceDocuments,
  getSourceDocumentFullQuery,
  listSourceDocumentsFromValidatedInput,
} from "@/modules/source-document/application/queries/source-document-queries";
```

- [ ] **Step 5: Run the full source-document query suites**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/queries/source-document-query-cursor.test.ts tests/unit/modules/source-document/application/queries/get-pending-source-documents.test.ts tests/unit/modules/source-document/application/queries/focused-source-document-queries.test.ts`
Expected: PASS

Run: `npm run test:integration -- tests/integration/modules/source-document/application/queries/source-document-queries.test.ts tests/integration/source-document/source-document-query-actions.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/source-document/application/queries/list-source-document-page.ts \
  src/modules/source-document/application/queries/list-source-document-collection.ts \
  src/modules/source-document/application/queries/get-pending-source-documents.ts \
  src/modules/source-document/application/queries/get-source-document-full.ts \
  src/modules/source-document/application/queries/source-document-queries.ts \
  src/modules/source-document/server-actions/queries.ts \
  src/modules/source-document/queries.ts \
  tests/unit/modules/source-document/application/queries/focused-source-document-queries.test.ts \
  tests/integration/modules/source-document/application/queries/source-document-queries.test.ts \
  tests/integration/source-document/source-document-query-actions.test.ts
git commit -m "refactor: split source-document queries by responsibility"
```

### Task 4: Add Pure Workspace Filter-State Tests Before Consolidating Hooks

**Files:**
- Create: `src/modules/workspace/ledger-filter-state.ts`
- Create: `tests/unit/modules/workspace/ledger-filter-state.test.ts`

- [ ] **Step 1: Write the failing workspace filter-state tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildLedgerEntryFilters,
  buildLedgerFilterKey,
  splitLedgerFilterChange,
} from "@/modules/workspace/ledger-filter-state";

describe("ledger-filter-state", () => {
  it("derives entry filters and filterKey from period + advanced filters", () => {
    const filters = buildLedgerEntryFilters(
      { period: "custom", startDate: "2026-03-01", endDate: "2026-03-31" },
      { categoryId: "cat-1", minAmount: 20, maxAmount: 100 }
    );

    expect(filters.categoryId).toBe("cat-1");
    expect(buildLedgerFilterKey(filters)).toBe("cat:cat-1|min:20|max:100");
  });

  it("splits a filter edit into period and advanced updates", () => {
    const result = splitLedgerFilterChange({
      currentPeriod: { period: "thisMonth" },
      currentFilters: {},
      nextFilters: {
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-31T00:00:00.000Z"),
        currency: "USD",
      },
    });

    expect(result.periodUpdate).toEqual({
      period: "custom",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });
    expect(result.advancedFilterUpdate).toEqual({
      currency: "USD",
    });
  });
});
```

- [ ] **Step 2: Run the new workspace helper test to verify it fails**

Run: `npm run test:unit -- tests/unit/modules/workspace/ledger-filter-state.test.ts`
Expected: FAIL because the new helper file does not exist yet.

- [ ] **Step 3: Implement the pure helper with no browser side effects**

```ts
export function buildLedgerEntryFilters(
  periodParams: PeriodParams,
  advancedFilters: LedgerAdvancedFilters
): EntryFilters { ... }

export function buildLedgerFilterKey(filters: EntryFilters): string | null { ... }

export function splitLedgerFilterChange(args: {
  currentPeriod: PeriodParams;
  currentFilters: EntryFilters;
  nextFilters: EntryFilters;
}): {
  periodUpdate?: PeriodParams;
  advancedFilterUpdate: LedgerAdvancedFilters;
} { ... }
```

- [ ] **Step 4: Run the new workspace helper test to verify it passes**

Run: `npm run test:unit -- tests/unit/modules/workspace/ledger-filter-state.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/workspace/ledger-filter-state.ts tests/unit/modules/workspace/ledger-filter-state.test.ts
git commit -m "test: add workspace filter state helper coverage"
```

### Task 5: Consolidate Workspace URL And Filter Orchestration Onto The Shared Helper

**Files:**
- Modify: `src/modules/workspace/hooks/usePeriodFilter.ts`
- Modify: `src/modules/workspace/ui/useDetailsTabFilters.ts`
- Modify: `src/modules/workspace/ui/useLedgerEntriesFilters.ts`
- Modify: `src/modules/workspace/ui/LedgerPageClient.tsx`
- Modify: `src/modules/workspace/ui/DetailsTab.tsx`
- Modify: `src/modules/workspace/ledger-url-params.ts`
- Modify: `tests/unit/modules/workspace/hooks/usePeriodFilter.test.ts`
- Modify: `tests/unit/hooks/useDetailsTabFilters.test.ts`
- Modify: `tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx`
- Modify: `tests/unit/modules/workspace/ui/LedgerEntriesTab.test.tsx`
- Modify: `tests/unit/workspace/ledger-url-params.test.ts`

- [ ] **Step 1: Extend `usePeriodFilter` to own both period and advanced-filter URL writes**

Replace the ad hoc callback currently created in `LedgerPageClient.tsx` with a returned function from the hook itself:

```ts
const {
  periodParams,
  filterParams,
  handlePeriodChange,
  handleFiltersChange,
  handleAdvancedFiltersChange,
} = usePeriodFilter(...);
```

- [ ] **Step 2: Rewrite `useDetailsTabFilters` to use the pure workspace helper instead of duplicating derivation/splitting**

Use the helper directly:

```ts
const filters = buildLedgerEntryFilters(periodParams, advancedFilters);
const filterKey = buildLedgerFilterKey(filters);

const handleFiltersChange = useCallback(
  (onPeriodChange, onAdvancedFiltersChange) =>
    (newFilters: EntryFilters) => {
      const { periodUpdate, advancedFilterUpdate } = splitLedgerFilterChange({
        currentPeriod: periodParams,
        currentFilters: filters,
        nextFilters: newFilters,
      });

      if (periodUpdate) onPeriodChange(periodUpdate);
      onAdvancedFiltersChange(advancedFilterUpdate);
    },
  [periodParams, filters]
);
```

- [ ] **Step 3: Remove the duplicate advanced-filter URL write path from `LedgerPageClient.tsx`**

Delete the local callback that directly called `updateLedgerSearchParams(...)` + `replaceLedgerUrl(...)` and consume the hook-returned handler instead.

- [ ] **Step 4: Update the workspace tests to follow the consolidated contract**

Adjust assertions so they verify:

- `usePeriodFilter` owns both period and advanced-filter URL writes
- `LedgerPageClient` no longer builds its own URL write callback
- `LedgerEntriesTab` and `DetailsTab` still receive the same effective filters

- [ ] **Step 5: Run the focused workspace tests**

Run: `npm run test:unit -- tests/unit/modules/workspace/ledger-filter-state.test.ts tests/unit/modules/workspace/hooks/usePeriodFilter.test.ts tests/unit/hooks/useDetailsTabFilters.test.ts tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx tests/unit/modules/workspace/ui/LedgerEntriesTab.test.tsx tests/unit/workspace/ledger-url-params.test.ts tests/unit/workspace/ledger-url-navigation.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/workspace/hooks/usePeriodFilter.ts \
  src/modules/workspace/ui/useDetailsTabFilters.ts \
  src/modules/workspace/ui/useLedgerEntriesFilters.ts \
  src/modules/workspace/ui/LedgerPageClient.tsx \
  src/modules/workspace/ui/DetailsTab.tsx \
  src/modules/workspace/ledger-url-params.ts \
  tests/unit/modules/workspace/hooks/usePeriodFilter.test.ts \
  tests/unit/hooks/useDetailsTabFilters.test.ts \
  tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx \
  tests/unit/modules/workspace/ui/LedgerEntriesTab.test.tsx \
  tests/unit/workspace/ledger-url-params.test.ts
git commit -m "refactor: consolidate workspace filter url orchestration"
```

### Task 6: Final Verification And Explicit Deferral Check

**Files:**
- Modify: none
- Test: `tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
- Test: `tests/integration/source-document/source-document-query-actions.test.ts`
- Test: `tests/integration/modules/stats/application/queries/get-enhanced-stats.test.ts`
- Test: `tests/unit/modules/source-document/application/queries/source-document-query-cursor.test.ts`
- Test: `tests/unit/modules/source-document/application/queries/get-pending-source-documents.test.ts`
- Test: `tests/unit/modules/source-document/application/queries/focused-source-document-queries.test.ts`
- Test: `tests/unit/modules/workspace/ledger-filter-state.test.ts`
- Test: `tests/unit/modules/workspace/hooks/usePeriodFilter.test.ts`
- Test: `tests/unit/hooks/useDetailsTabFilters.test.ts`
- Test: `tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx`
- Test: `tests/unit/modules/workspace/ui/LedgerEntriesTab.test.tsx`

- [ ] **Step 1: Run the focused unit suites**

Run: `npm run test:unit -- tests/unit/modules/source-document/application/queries/source-document-query-cursor.test.ts tests/unit/modules/source-document/application/queries/get-pending-source-documents.test.ts tests/unit/modules/source-document/application/queries/focused-source-document-queries.test.ts tests/unit/modules/workspace/ledger-filter-state.test.ts tests/unit/modules/workspace/hooks/usePeriodFilter.test.ts tests/unit/hooks/useDetailsTabFilters.test.ts tests/unit/modules/workspace/ui/LedgerPageClient.test.tsx tests/unit/modules/workspace/ui/LedgerEntriesTab.test.tsx tests/unit/workspace/ledger-url-params.test.ts tests/unit/workspace/ledger-url-navigation.test.ts`
Expected: PASS

- [ ] **Step 2: Run the focused integration suites**

Run: `npm run test:integration -- tests/integration/modules/source-document/application/queries/source-document-queries.test.ts tests/integration/source-document/source-document-query-actions.test.ts tests/integration/modules/stats/application/queries/get-enhanced-stats.test.ts`
Expected: PASS

- [ ] **Step 3: Run lint on the touched code and tests**

Run: `npm run lint -- src/modules/source-document/application/queries src/modules/source-document/server-actions/queries.ts src/modules/source-document/queries.ts src/modules/workspace tests/unit/modules/source-document/application/queries tests/unit/modules/workspace tests/unit/hooks/useDetailsTabFilters.test.ts tests/integration/modules/source-document/application/queries/source-document-queries.test.ts tests/integration/source-document/source-document-query-actions.test.ts tests/integration/modules/stats/application/queries/get-enhanced-stats.test.ts`
Expected: PASS

- [ ] **Step 4: Verify the deferred files remain untouched in this batch**

Run: `git diff --name-only -- src/modules/stats/application/queries/get-enhanced-stats.ts src/modules/source-document/hooks/useSourceDocumentInputController.ts src/modules/task-queue/ui/useTaskQueueModal.ts src/components/ui/image-editor.tsx src/modules/source-document/ui/SourceDocumentCard.tsx src/components/ui/calculator-input.tsx`
Expected: no output, unless a task here absolutely had to touch one of them. If there is output, stop and split that extra work into a dedicated follow-up.

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document src/modules/workspace tests/unit/modules/source-document/application/queries tests/unit/modules/workspace tests/unit/hooks/useDetailsTabFilters.test.ts tests/integration/modules/source-document/application/queries/source-document-queries.test.ts tests/integration/source-document/source-document-query-actions.test.ts
git commit -m "chore: verify query maintainability follow-up"
```

## Deferred Items

### Enhanced Stats

- Leave `src/modules/stats/application/queries/get-enhanced-stats.ts` unchanged in this plan.
- Use the existing integration suite as the regression boundary.
- Revisit only when production measurements show the current full-fetch approach is materially slow.
- When revisiting, push specific aggregations into SQL first. Do not add pre-aggregation tables or a cache layer by default.

### Oversized Hooks And Components

These remain intentionally deferred:

- `src/modules/source-document/hooks/useSourceDocumentInputController.ts`
- `src/modules/task-queue/ui/useTaskQueueModal.ts`
- `src/components/ui/image-editor.tsx`
- `src/modules/source-document/ui/SourceDocumentCard.tsx`
- `src/components/ui/calculator-input.tsx`

If a future bugfix or feature touches one of them:

- split only the part being changed
- prefer a small local hook or child component
- do not introduce a shared state-machine abstraction unless multiple concrete call sites demand it

## Notes For The Implementer

- Keep the public API stable. This plan is about file responsibility and orchestration cleanup, not a new contract surface.
- Preserve behavior while splitting. The point is to reduce local complexity, not to redesign the source-document or workspace flows.
- If the previous contract-cleanup plan used a final name other than `list-source-document-collection.ts`, adopt that final naming consistently instead of fighting it here.
