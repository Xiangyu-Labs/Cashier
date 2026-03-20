# Narrow Module Public API Surface Implementation Plan

> **For agentic workers:** REQUIRED SKILL: Use $chant to carry this work through debugging or discussion if needed, then plan repair, staged execution, independent review, full verification, merge to main, and worktree cleanup.

**Goal:** Replace implicit first-level module public APIs with an explicit lint-enforced allowlist and migrate tests and production imports to those declared boundaries.

**Architecture:** `src/modules/*` remains the vertical-slice unit, but cross-module imports are now allowed only through declared public entrypoints. Internal implementation tests move next to the owning module so they can use local relative imports without turning internal module paths into cross-module public APIs.

**Tech Stack:** ESLint flat config, Vitest, Next.js App Router, TypeScript

---

## Context and boundaries

- In scope: module boundary lint rules, boundary tests, affected production imports, test import migration, architecture docs, Vitest discovery for colocated implementation tests.
- Out of scope: changing business behavior of ledger/source-document/task processing, broad UI redesign, non-boundary refactors unrelated to module imports.
- Assumptions:
  - Module root imports stay disallowed.
  - Explicit public entrypoints may include module-owned `ui` or `hooks` barrels when they are intentionally consumed cross-module.
  - Deep imports below approved barrels remain private.

## Stage map

### Stage 1: Encode the boundary policy

- Goal: replace the old “root forbidden, deep forbidden” heuristic with an explicit per-module public-entrypoint allowlist.
- Dependency: all later migrations need the new source of truth first.
- Exit criteria: boundary tests express the allowlist model and ESLint enforces it for `src` and `tests`.
- Verification gate: `npm run test:unit -- tests/unit/eslint/feature-boundaries.test.ts`

### Stage 2: Fix production and test imports

- Goal: migrate remaining violations to approved barrels or colocated relative imports.
- Dependency: requires Stage 1 rules to be stable.
- Exit criteria: `npx eslint src tests` passes with the new rules.
- Verification gate: `npx eslint src tests`

### Stage 3: Verify moved tests and updated tooling

- Goal: ensure colocated tests are discovered and still pass, and boundary docs match the implemented rules.
- Dependency: import migration complete.
- Exit criteria: targeted unit and integration suites covering moved or rewritten imports pass.
- Verification gate: targeted `vitest` runs plus a spot-check of integration suites affected by import rewrites.

## Chunk map per stage

### Stage 1

- `chunk_id`: `boundary-rules`
- `objective`: add explicit module public-entrypoint allowlists and apply them to app, lib, modules, and tests
- `write_scope`: `eslint.config.mjs`, `tests/unit/eslint/feature-boundaries.test.ts`
- `read_only_context`: `docs/architecture/architecture_overview.md`, current module import graph
- `depends_on`: none
- `verification_commands`: `npm run test:unit -- tests/unit/eslint/feature-boundaries.test.ts`
- `quality_bar`: no implicit first-level module public APIs remain; boundary tests cover representative allowed and forbidden paths
- `branch_name`: `chant/narrow-module-public-api-surface`
- `worktree_path`: `.worktrees/narrow-module-public-api-surface`
- `merge_order`: `1`

### Stage 2

- `chunk_id`: `import-migration`
- `objective`: migrate remaining production and test imports to declared public entrypoints or colocated relative imports
- `write_scope`: affected `src/**/*.ts(x)`, `tests/**/*.test.ts(x)`, moved `src/**/*.test.ts(x)`, `vitest.config.ts`, `vitest.unit.config.ts`
- `read_only_context`: module barrel exports, moved test ownership, import search results
- `depends_on`: `boundary-rules`
- `verification_commands`: `npx eslint src tests`
- `quality_bar`: production code has no cross-module internal imports; implementation tests no longer force internal paths to be public
- `branch_name`: `chant/narrow-module-public-api-surface`
- `worktree_path`: `.worktrees/narrow-module-public-api-surface`
- `merge_order`: `2`

### Stage 3

- `chunk_id`: `verification-and-docs`
- `objective`: verify moved tests execute and update architecture docs
- `write_scope`: `docs/architecture/architecture_overview.md`, `docs/chant/plans/2026-03-20-narrow-module-public-api-surface.md`
- `read_only_context`: changed tests and lint output
- `depends_on`: `import-migration`
- `verification_commands`: `npm run test:unit -- tests/unit/eslint/feature-boundaries.test.ts`, `npm run test:unit`, targeted integration `vitest` runs
- `quality_bar`: docs match actual enforced rule; test discovery includes colocated implementation tests
- `branch_name`: `chant/narrow-module-public-api-surface`
- `worktree_path`: `.worktrees/narrow-module-public-api-surface`
- `merge_order`: `3`

## Task steps

1. Write failing boundary tests for newly forbidden auth helper, currency service, workspace internal state, and deep stats UI imports.
2. Implement explicit module allowlists in `eslint.config.mjs`.
3. Re-run the boundary test file and confirm it passes.
4. Migrate production imports to the declared public barrels or local module helpers.
5. Migrate boundary-safe tests to public barrels.
6. Move implementation tests beside the module code they exercise and replace cross-module alias imports with local relative imports.
7. Expand Vitest include globs so colocated `src/**/*.test.ts(x)` files run.
8. Run `npx eslint src tests` and resolve remaining style/type lint failures surfaced in tests.
9. Update architecture docs to describe declared public entrypoints instead of implicit first-level paths.

## Review loop

- Implementer completes the lint, import, and test migration changes.
- Independent reviewer checks that no module internal alias imports remain across module boundaries.
- Implementer fixes any valid findings and reruns lint/test verification.
- Reviewer re-checks the final diff against the boundary policy.
- Controller merges once lint and targeted tests are green.

## Final integration

- Run `npm run test:unit -- tests/unit/eslint/feature-boundaries.test.ts`
- Run `npx eslint src tests`
- Run `npm run test:unit`
- Run targeted integration suites for updated import behavior
- Merge to `main`
- Re-run the lint and boundary test file post-merge

## Cleanup

- Remove temporary worktrees created for the boundary migration
- Preserve branches for audit/review history
