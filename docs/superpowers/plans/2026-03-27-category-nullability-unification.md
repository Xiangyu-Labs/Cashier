# Category Nullability Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `categoryId = null` a fully supported formal state across deletion fallback, details filtering, stats drilldown, and source-document batch category changes, while keeping Quick Entry category selection required.

**Architecture:** Keep `null` as the only data-layer representation of "uncategorized". Treat `__uncategorized__` as a UI/query sentinel only at interaction boundaries, translate it into `IS NULL` filtering in ledger entry queries, and preserve Quick Entry's stricter product rule as an explicit exception. Fix the source-document batch category flow so it passes `null` rather than `""`.

**Tech Stack:** Next.js, TypeScript, Drizzle ORM, Zod, Vitest

---

## File Structure / Responsibility Map

- `src/modules/workspace/ledger-url-params.ts`
  - Own URL serialization/deserialization of ledger filters.
  - Needs explicit round-trip support for uncategorized drilldown instead of deleting the sentinel value.
- `src/modules/ledger/application/queries/build-ledger-entry-filters.ts`
  - Own SQL filter translation for details entry queries.
  - Needs explicit `categoryId IS NULL` support.
- `src/modules/ledger/application/queries/list-ledger-entries.ts`
  - Own validated input -> query filter wiring.
  - May need sentinel normalization before calling the query builder.
- `src/modules/source-document/ui/SourceDocumentDetailModal.tsx`
  - Own source-document batch category UX wiring.
  - Needs to preserve `null` when user selects uncategorized.
- `src/modules/ledger/ui/EntryFilterPanel.tsx`
  - Own filter UI state and category selector behavior.
  - Needs to keep the uncategorized sentinel stable instead of collapsing it into generic string behavior.
- `src/modules/workspace/hooks/useDrilldownNavigation.ts`
  - Own stats/calendar -> details URL drilldown behavior.
  - Must preserve uncategorized drilldown semantics end-to-end.
- `tests/unit/workspace/ledger-url-params.test.ts`
  - Cover URL read/write semantics for uncategorized.
- `tests/unit/modules/workspace/hooks/useDrilldownNavigation.test.ts`
  - Cover drilldown URLs for uncategorized.
- `tests/integration/ledger/entry-actions.test.ts`
  - Add/extend batch update coverage for `categoryId: null`.
- `tests/integration/cascade-operations.test.ts`
  - Preserve regression coverage for category deletion -> uncategorized fallback.
- `tests/integration/stats/enhanced-stats.test.ts`
  - Preserve regression coverage that stats still surface uncategorized entries correctly.

## Implementation Notes

- **Do not change Quick Entry behavior.** `src/modules/source-document/contract-schemas.ts` and related Quick Entry code should remain category-required.
- **Do not introduce a real database category row for uncategorized.** Continue using `categoryId = null` only.
- **One source of truth:** UI sentinel `__uncategorized__` exists only at view/navigation boundaries. Query layer should receive either a real UUID or an explicit uncategorized marker that is translated into `IS NULL`.
- **TDD first:** every behavior change starts with a failing test.

---

### Task 1: Lock down URL semantics for uncategorized filters

**Files:**
- Modify: `tests/unit/workspace/ledger-url-params.test.ts`
- Modify: `src/modules/workspace/ledger-url-params.ts`

- [ ] **Step 1: Write the failing URL tests for uncategorized round-tripping**

Add/adjust tests to prove all of the following:
- writing `{ categoryId: "__uncategorized__" }` preserves a category filter in the URL instead of deleting it
- reading that URL returns a filter state that still means uncategorized
- unrelated filter updates do not accidentally drop uncategorized

- [ ] **Step 2: Run the focused unit test to verify it fails**

Run: `pnpm vitest run tests/unit/workspace/ledger-url-params.test.ts`
Expected: FAIL on uncategorized URL expectations.

- [ ] **Step 3: Implement minimal URL-layer support**

Update `src/modules/workspace/ledger-url-params.ts` so uncategorized is represented intentionally rather than being deleted as if it were "no filter". Keep the implementation localized to URL read/write helpers.

- [ ] **Step 4: Re-run the focused unit test**

Run: `pnpm vitest run tests/unit/workspace/ledger-url-params.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/workspace/ledger-url-params.test.ts src/modules/workspace/ledger-url-params.ts
git commit -m "test: lock uncategorized ledger URL semantics"
```

### Task 2: Make details query filtering treat uncategorized as `category_id IS NULL`

**Files:**
- Modify: `tests/integration/ledger/entry-actions.test.ts`
- Modify: `src/modules/ledger/application/queries/build-ledger-entry-filters.ts`
- Modify: `src/modules/ledger/application/queries/list-ledger-entries.ts`
- Review only: `src/modules/ledger/contract-schemas.ts`

- [ ] **Step 1: Add failing integration coverage for uncategorized details filtering**

Extend `tests/integration/ledger/entry-actions.test.ts` with a case that seeds:
- one uncategorized entry
- one categorized entry
then calls the public list entry action using the uncategorized filter path and expects only the uncategorized entry back.

- [ ] **Step 2: Run the focused integration test to verify it fails**

Run: `pnpm vitest run --config vitest.integration.config.ts tests/integration/ledger/entry-actions.test.ts`
Expected: FAIL on the new uncategorized filter case.

- [ ] **Step 3: Implement minimal query normalization and SQL translation**

Requirements:
- preserve existing UUID category filtering
- add an explicit uncategorized path that becomes `isNull(ledgerEntries.categoryId)`
- keep the change inside the query boundary; do not leak SQL concerns into UI code

- [ ] **Step 4: Re-run the focused integration test**

Run: `pnpm vitest run --config vitest.integration.config.ts tests/integration/ledger/entry-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/ledger/entry-actions.test.ts src/modules/ledger/application/queries/build-ledger-entry-filters.ts src/modules/ledger/application/queries/list-ledger-entries.ts
git commit -m "feat: support uncategorized entry filtering"
```

### Task 3: Preserve uncategorized drilldown from stats/calendar into details

**Files:**
- Modify: `tests/unit/modules/workspace/hooks/useDrilldownNavigation.test.ts`
- Modify: `src/modules/workspace/hooks/useDrilldownNavigation.ts`
- Modify if needed: `src/modules/ledger/ui/EntryFilterPanel.tsx`
- Review only: `src/modules/stats/ui/StatsRanking.tsx`

- [ ] **Step 1: Add failing drilldown coverage for uncategorized category clicks**

Write/adjust tests proving that when stats or date drilldown requests `__uncategorized__`, the resulting details URL still encodes the uncategorized filter instead of collapsing to "all categories".

- [ ] **Step 2: Run the drilldown test file to verify it fails**

Run: `pnpm vitest run tests/unit/modules/workspace/hooks/useDrilldownNavigation.test.ts`
Expected: FAIL on the uncategorized drilldown expectation.

- [ ] **Step 3: Implement minimal navigation/UI state fixes**

Requirements:
- drilldown keeps uncategorized filter intact
- details filter UI still shows the uncategorized option as selected when applicable
- no regression for "all categories" behavior

- [ ] **Step 4: Re-run the drilldown and filter tests**

Run: `pnpm vitest run tests/unit/modules/workspace/hooks/useDrilldownNavigation.test.ts tests/unit/workspace/ledger-url-params.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/modules/workspace/hooks/useDrilldownNavigation.test.ts src/modules/workspace/hooks/useDrilldownNavigation.ts src/modules/ledger/ui/EntryFilterPanel.tsx src/modules/workspace/ledger-url-params.ts
git commit -m "fix: preserve uncategorized drilldown filters"
```

### Task 4: Fix source-document batch category changes to send `null`, not empty string

**Files:**
- Modify: `tests/integration/ledger/entry-actions.test.ts`
- Modify: `src/modules/source-document/ui/SourceDocumentDetailModal.tsx`
- Review only: `src/modules/ledger/ui/batch-action-toolbar/LedgerEntriesBatchActionToolbar.tsx`

- [ ] **Step 1: Add failing coverage for batch category removal**

Add a test that exercises the batch-update entry action with `categoryId: null` and proves entries become uncategorized. If there is already lower-level coverage, extend it to clearly reflect the source-document batch semantics.

- [ ] **Step 2: Run the focused integration test to verify current coverage gap / failure**

Run: `pnpm vitest run --config vitest.integration.config.ts tests/integration/ledger/entry-actions.test.ts`
Expected: FAIL on the new `categoryId: null` batch-update assertion, or reveal missing coverage that now fails once added.

- [ ] **Step 3: Implement the minimal UI wiring fix**

Change `SourceDocumentDetailModal` so the batch category callback preserves `null` for uncategorized instead of coercing it to `""`.

- [ ] **Step 4: Re-run the focused integration test**

Run: `pnpm vitest run --config vitest.integration.config.ts tests/integration/ledger/entry-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/ledger/entry-actions.test.ts src/modules/source-document/ui/SourceDocumentDetailModal.tsx
git commit -m "fix: preserve null category in source document batch updates"
```

### Task 5: Regression sweep for deletion fallback and stats semantics

**Files:**
- Modify if needed: `tests/integration/cascade-operations.test.ts`
- Modify if needed: `tests/integration/stats/enhanced-stats.test.ts`

- [ ] **Step 1: Review existing regression tests for uncategorized semantics**

Confirm the suite still explicitly covers:
- deleting a category nullifies related entries
- stats groups null-category entries under uncategorized

Add only the minimum assertions needed if coverage is indirect or ambiguous.

- [ ] **Step 2: Run the focused regression suite**

Run: `pnpm vitest run --config vitest.integration.config.ts tests/integration/cascade-operations.test.ts tests/integration/stats/enhanced-stats.test.ts tests/integration/ledger/entry-actions.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit any regression-test clarifications**

```bash
git add tests/integration/cascade-operations.test.ts tests/integration/stats/enhanced-stats.test.ts tests/integration/ledger/entry-actions.test.ts
git commit -m "test: cover uncategorized regression paths"
```

### Task 6: Full verification before handoff

**Files:**
- No code changes expected

- [ ] **Step 1: Run all relevant unit tests**

Run: `pnpm vitest run tests/unit/workspace/ledger-url-params.test.ts tests/unit/modules/workspace/hooks/useDrilldownNavigation.test.ts`
Expected: PASS.

- [ ] **Step 2: Run all relevant integration tests**

Run: `pnpm vitest run --config vitest.integration.config.ts tests/integration/ledger/entry-actions.test.ts tests/integration/cascade-operations.test.ts tests/integration/stats/enhanced-stats.test.ts`
Expected: PASS.

- [ ] **Step 3: Run targeted typecheck if affected signatures changed broadly**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Record final status commit if needed**

```bash
git status
```
Expected: clean working tree, or only intentional staged changes pending final squash/review.
