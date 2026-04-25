# Undefined Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate ambiguous cross-layer `undefined` usage, make repository semantics consistent, and enable stricter TypeScript checks safely.

**Architecture:** Use a controller worktree plus isolated worker worktrees. The controller lands governance docs and integration work first, then workers update disjoint ownership areas in parallel. Integration happens in a fixed merge order so contract and shared-abstraction changes land before their consumers.

**Tech Stack:** TypeScript 5, Next.js 16, React 19, Zod 4, Vitest 4, Git worktrees

---

## Ownership Map

### Controller

**Files:**
- Create: `docs/superpowers/specs/2026-03-19-undefined-governance-design.md`
- Create: `docs/superpowers/plans/2026-03-19-undefined-governance.md`
- Modify: shared integration points after worker branches return

- [ ] **Step 1: Create controller worktree**

Run:

```bash
git worktree add .worktrees/type-hygiene-controller -b type-hygiene/controller
```

- [ ] **Step 2: Reuse dependencies in controller worktree**

Run:

```bash
ln -s ../node_modules .worktrees/type-hygiene-controller/node_modules
```

Skip if the symlink or directory already exists.

- [ ] **Step 3: Verify controller baseline**

Run:

```bash
npm run test:run
```

Expected: baseline passes before governance work starts.

- [ ] **Step 4: Commit governance docs**

Run:

```bash
git add docs/superpowers/specs/2026-03-19-undefined-governance-design.md docs/superpowers/plans/2026-03-19-undefined-governance.md
git commit -m "docs: add undefined governance design and implementation plan"
```

---

### Task 1: Contracts and Schema Boundaries

**Files:**
- Modify: `src/modules/source-document/contracts.ts`
- Modify: `src/modules/source-document/contract-schemas.ts`
- Modify: `src/modules/ledger/contract-schemas.ts`
- Modify: `src/lib/validation.ts`
- Modify: direct schema-boundary callers that currently construct payload objects with explicit `undefined`
- Test: relevant existing contract/server-action tests

- [ ] **Step 1: Write or extend failing tests for omission-vs-null semantics**

Cover:

- optional fields omitted at schema boundaries
- nullable fields still accept explicit `null`
- payload builders no longer need `prop: undefined`

- [ ] **Step 2: Run the new contract-focused tests and confirm red**

Run only the affected tests first.

- [ ] **Step 3: Update contracts and schema callers**

Implement:

- optional means omitted
- nullable means explicit empty
- remove boundary object fields whose value is only `undefined`

- [ ] **Step 4: Re-run focused tests until green**

- [ ] **Step 5: Run stricter typecheck on owned files**

Run:

```bash
npx tsc --noEmit --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess
```

Review output and ensure owned-file regressions are resolved.

---

### Task 2: Workspace / Period / Filter Semantics

**Files:**
- Modify: `src/lib/period-utils.ts`
- Modify: `src/modules/workspace/ledger-url-params.ts`
- Modify: `src/modules/workspace/hooks/usePeriodFilter.ts`
- Modify: `src/modules/workspace/ui/useDetailsTabFilters.ts`
- Modify: `src/modules/ledger/ui/EntryFilterPanel.tsx`
- Test: period/filter hook and UI tests

- [ ] **Step 1: Write failing tests for canonical empty filter semantics**

Cover:

- omitted URL params
- explicit clear values
- date filter conversion between URL, component, and query state

- [ ] **Step 2: Run focused tests to verify red**

- [ ] **Step 3: Normalize `PeriodParams`, `EntryFilters`, and URL update semantics**

Implement:

- one canonical empty representation per layer
- no `?? undefined` boundary leakage
- no mixed null/undefined drift in filter propagation

- [ ] **Step 4: Run focused tests to green**

- [ ] **Step 5: Run stricter typecheck and fix owned-file issues**

---

### Task 3: Source Document Pipeline

**Files:**
- Modify: `src/modules/source-document/application/use-cases/create-from-credential.ts`
- Modify: `src/modules/source-document/application/use-cases/create-and-queue-source-document.ts`
- Modify: `src/modules/source-document/application/use-cases/retry-source-document.ts`
- Modify: `src/modules/source-document/application/queries/source-document-queries.ts`
- Modify: `src/modules/source-document/server-actions/create.ts`
- Modify: `src/modules/source-document/server-actions/retry.ts`
- Modify: `src/modules/source-document/server-actions/update.ts`
- Test: source-document action/query/integration tests

- [ ] **Step 1: Write failing tests for boundary cleanup and index safety**

Cover:

- payload omission behavior
- retry semantics when values are absent
- pagination / cursor / map lookup safety

- [ ] **Step 2: Run focused tests to verify red**

- [ ] **Step 3: Refactor source-document chain**

Implement:

- boundary cleanup before passing deeper
- no cross-layer `undefined` payload leakage
- explicit handling for `Map.get()`, pagination index, cursor parsing

- [ ] **Step 4: Run focused tests to green**

- [ ] **Step 5: Run stricter typecheck and fix owned-file issues**

---

### Task 4: Shared Abstractions and Third-Party Boundaries

**Files:**
- Modify: `src/lib/mutations/use-ledger-mutation.ts`
- Modify: `src/lib/flow/types.ts`
- Modify: `src/lib/ai/openai-client.ts`
- Modify: `src/lib/error-handlers.ts`
- Modify: `src/components/ui/confirm-dialog.tsx`
- Modify: other shared wrappers that forward bare `undefined` into third-party props
- Test: shared hook/client/component tests

- [ ] **Step 1: Write failing tests for shared optionality contracts**

Cover:

- mutation context optionality without type assertion escape hatches
- request-object omission for SDK parameters
- optional response fields omitted when absent
- third-party props omitted rather than passed as `undefined`

- [ ] **Step 2: Run focused tests to verify red**

- [ ] **Step 3: Refactor shared abstractions**

Implement:

- explicit `TContext | undefined` contracts
- no `undefined as unknown as ...`
- object builders that conditionally omit fields

- [ ] **Step 4: Run focused tests to green**

- [ ] **Step 5: Run stricter typecheck and fix owned-file issues**

---

### Task 5: Consumer Modules and Index Safety

**Files:**
- Modify: `src/modules/currency/actions.ts`
- Modify: `src/modules/currency/**/*.ts*`
- Modify: `src/app/[locale]/login/**/*.ts*`
- Modify: other consumer files that fail strict indexed-access checks and are not owned by Tasks 1-4
- Test: currency/login tests plus affected consumer tests

- [ ] **Step 1: Write failing tests for unsafe lookup/index behavior**

Cover:

- grouped conversion access
- login error lookup
- any `find()`/index access path currently relying on loose inference

- [ ] **Step 2: Run focused tests to verify red**

- [ ] **Step 3: Fix consumer-side narrowing**

Implement:

- explicit guards for map lookups and indexes
- stable fallback handling where appropriate
- removal of non-null assertions that only mask uncertainty

- [ ] **Step 4: Run focused tests to green**

- [ ] **Step 5: Run stricter typecheck and fix owned-file issues**

---

### Task 6: Tests Migration

**Files:**
- Modify: `tests/integration/**`
- Modify: `tests/unit/**`
- Modify: `tests/setup.ts`

- [ ] **Step 1: Split test failures into integration and unit buckets**

- [ ] **Step 2: Write/adjust failing tests where semantics changed**

- [ ] **Step 3: Fix test helper typing and unsafe lookups**

- [ ] **Step 4: Re-run unit and integration suites**

Run:

```bash
npm run test:unit
npm run test:integration
```

- [ ] **Step 5: Run full stricter typecheck**

Run:

```bash
npx tsc --noEmit --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess
```

---

### Task 7: Final Configuration and Integration

**Files:**
- Modify: `tsconfig.json`
- Modify: any remaining integration conflict points

- [ ] **Step 1: Verify `src` and `tests` both pass stricter checks before config change**

- [ ] **Step 2: Update `tsconfig.json`**

Add:

```json
"exactOptionalPropertyTypes": true,
"noUncheckedIndexedAccess": true
```

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run test:run
npx tsc --noEmit
```

- [ ] **Step 4: Commit final integration**

```bash
git add tsconfig.json src tests docs
git commit -m "refactor(types): enforce strict undefined semantics"
```

## Merge Order

Controller must merge worker branches in this order:

1. `type-hygiene/contracts-schema`
2. `type-hygiene/shared-abstractions`
3. `type-hygiene/workspace-filters`
4. `type-hygiene/source-document-chain`
5. `type-hygiene/index-safety-consumers`
6. test branches
7. final `tsconfig.json` change

## Verification Checklist

- No new `prop: undefined` at boundaries
- No `undefined as unknown as ...`
- No bare `undefined` in DTO/props/schema/SDK payload objects
- All new behavior covered by tests that fail before the implementation
- Strict typechecks run after each merged area
