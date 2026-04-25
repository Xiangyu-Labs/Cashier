# Repo Hygiene Next Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the highest-value remaining repository hygiene issues after the current in-flight plans land: Vitest mixed-run friction, deprecated module entry leftovers, drifting test directory conventions, empty-dir noise, currency public-entry drift, and the global formatting debt.

**Architecture:** This is a repository-governance plan, not a feature plan. Land it as separate PR tracks: first fix the Vitest project configuration and add regression coverage, then remove deprecated entrypoint leftovers and finish the currency module’s final public-entry shape, then add a grandfathered test-location governance rule instead of doing a big-bang migration, and finally do one pure mechanical formatting PR so `npm run format:check` stops failing globally. Prefer deletion and direct file moves over new abstractions or helper layers.

**Tech Stack:** TypeScript, Vitest, ESLint, Prettier, filesystem governance tests, Next.js repo tooling

---

## Scope Check

These items are related, but not tightly coupled. They should land as **four separate PR tracks** even though they are captured in one plan:

1. Vitest mixed-run compatibility
2. Deprecated entrypoint cleanup + currency public-entry unification + empty-dir cleanup
3. Gradual test-directory governance
4. One-time mechanical formatting sweep

This plan assumes the current two in-flight plans finish first, because the formatting sweep should go last and the documentation cleanup may change `coding-patterns.md`.

## File Map

### Track A: Vitest Mixed-Run Compatibility

- `vitest.shared.config.ts`
  - Source of truth for project definitions, `sequence.groupOrder`, and `maxWorkers`.
- `vitest.config.ts`
  - Aggregated full-run config used by `npm run test:run`.
- `tests/unit/tooling/vitest-config-boundaries.test.ts`
  - Existing tooling test; extend it so it guards against the exact mixed-run failure mode.

### Track B: Deprecated Entrypoint Cleanup And Currency Public API Shape

- `src/modules/auth/helpers.ts`
  - Deprecated leftover file; should be removed if there are no runtime imports.
- `src/modules/currency/services.ts`
  - Deprecated leftover file; should be removed.
- `src/modules/workspace/contracts.ts`
  - Deprecated leftover file; should be removed.
- `src/modules/currency/useConvertedAmount.ts`
  - Current root-level hook implementation; should move under `hooks/`.
- `src/modules/currency/useAmountDisplay.ts`
  - Current root-level hook implementation; should move under `hooks/`.
- `src/modules/currency/hooks/useConvertedAmount.ts`
  - New internal implementation location.
- `src/modules/currency/hooks/useAmountDisplay.ts`
  - New internal implementation location.
- `src/modules/currency/client.ts`
  - Public client-facing entrypoint; should become the only supported cross-module hook entry.
- `tests/unit/modules/currency/useConvertedAmount.test.ts`
  - Hook behavior test; update import path after the move.
- `tests/unit/modules/currency/useAmountDisplay.test.ts`
  - Hook behavior test; update import path and mocks after the move.
- `tests/unit/tooling/repo-hygiene-governance.test.ts`
  - New governance test for forbidden leftover files and empty placeholder directories.
- `src/components/auth`
  - Empty placeholder directory; remove.
- `src/components/entries`
  - Empty placeholder directory; remove.
- `src/components/stats`
  - Empty placeholder directory; remove.

### Track C: Gradual Test-Directory Governance

- `tests/tooling/legacy-unit-test-allowlist.ts`
  - Exact allowlist of grandfathered legacy unit-test file paths outside `tests/unit/modules/*`.
- `tests/unit/tooling/unit-test-location-governance.test.ts`
  - New governance test that prevents new legacy module-owned unit tests from being added in old locations.
- `docs/architecture/coding-patterns.md`
  - Canonical place to document the “new tests go under `tests/unit/modules/*`; legacy paths may only shrink” rule.

### Track D: Mechanical Formatting Sweep

- `package.json`
  - Keep the existing `format` / `format:check` scripts unchanged.
- Entire repo working tree
  - Run one dedicated Prettier sweep only after Tracks A-C are merged or rebased.

## Non-Goals

- Do not redesign or expand the test runner architecture beyond fixing the known mixed-run conflict.
- Do not add a touched-files formatting tool in this batch; choose the dedicated mechanical sweep instead.
- Do not perform a big-bang migration of all legacy test files into `tests/unit/modules/*`.
- Do not add new public entrypoints for currency; `client.ts` remains the public surface.

## Decision Notes

- **Formatting debt choice:** use a single pure mechanical formatting PR, not a touched-files-only policy. The repo already has global formatting debt across 200+ files, so the cleanest end-state is to make `npm run format:check` pass repo-wide again.
- **Test migration choice:** use a grandfathered allowlist plus governance test, not a one-shot migration. That gives a low-risk ratchet without forcing noisy file moves now.

### Task 1: Guard Against The Vitest Mixed-Run Conflict

**Files:**
- Modify: `tests/unit/tooling/vitest-config-boundaries.test.ts`
- Modify: `vitest.shared.config.ts`

- [ ] **Step 1: Write the failing tooling assertion for duplicate `groupOrder` values with different `maxWorkers`**

```ts
import { describe, expect, it } from "vitest";
import config from "../../../vitest.config";

describe("vitest config boundaries", () => {
  it("does not reuse the same groupOrder across projects with different maxWorkers", () => {
    const projects =
      (config.test?.projects as Array<{
        test?: { name?: string; maxWorkers?: unknown; sequence?: { groupOrder?: number } };
      }> | undefined) ?? [];

    const seen = new Map<number, unknown>();

    for (const project of projects) {
      const groupOrder = project.test?.sequence?.groupOrder;
      const maxWorkers = project.test?.maxWorkers;
      if (groupOrder == null) continue;

      if (seen.has(groupOrder)) {
        expect(seen.get(groupOrder)).toEqual(maxWorkers);
      } else {
        seen.set(groupOrder, maxWorkers);
      }
    }
  });
});
```

- [ ] **Step 2: Run the tooling test to verify it fails**

Run: `npm run test:unit -- tests/unit/tooling/vitest-config-boundaries.test.ts`
Expected: FAIL because `unit-general` and `integration-node` currently both use `groupOrder: 0` with different `maxWorkers`.

- [ ] **Step 3: Make every project group order unambiguous in `vitest.shared.config.ts`**

Use one unique `groupOrder` per project family. For example:

```ts
// unit-general
sequence: { groupOrder: 0 }

// unit-db
sequence: { groupOrder: 1 }

// governance
sequence: { groupOrder: 2 }

// integration-node
sequence: { groupOrder: 3 }

// integration-dom
sequence: { groupOrder: 4 }
```

- [ ] **Step 4: Re-run the tooling test to verify it passes**

Run: `npm run test:unit -- tests/unit/tooling/vitest-config-boundaries.test.ts`
Expected: PASS

- [ ] **Step 5: Reproduce the original mixed-run command and verify it now works**

Run: `npm run test:run -- tests/unit/lib/ratelimit.test.ts tests/integration/modules/stats/application/queries/get-enhanced-stats.test.ts`
Expected: PASS and no Vitest error about projects sharing `sequence.groupOrder` with different `maxWorkers`.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/tooling/vitest-config-boundaries.test.ts vitest.shared.config.ts
git commit -m "test: fix vitest mixed-run project ordering"
```

### Task 2: Add Repo-Hygiene Governance For Deprecated Files And Placeholder Directories

**Files:**
- Create: `tests/unit/tooling/repo-hygiene-governance.test.ts`

- [ ] **Step 1: Write the failing governance test**

```ts
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("repo hygiene governance", () => {
  it("does not keep deprecated module entry files", () => {
    const root = process.cwd();
    const forbiddenFiles = [
      "src/modules/auth/helpers.ts",
      "src/modules/currency/services.ts",
      "src/modules/workspace/contracts.ts",
      "src/modules/currency/useConvertedAmount.ts",
      "src/modules/currency/useAmountDisplay.ts",
    ];

    const existing = forbiddenFiles.filter((file) => existsSync(path.join(root, file)));
    expect(existing).toEqual([]);
  });

  it("does not keep empty placeholder component directories", () => {
    const root = process.cwd();
    const forbiddenDirs = [
      "src/components/auth",
      "src/components/entries",
      "src/components/stats",
    ];

    const existing = forbiddenDirs.filter((dir) => existsSync(path.join(root, dir)));
    expect(existing).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the governance test to verify it fails**

Run: `npm run test:unit -- tests/unit/tooling/repo-hygiene-governance.test.ts`
Expected: FAIL because the deprecated files and empty directories still exist.

- [ ] **Step 3: Commit the failing governance test**

```bash
git add tests/unit/tooling/repo-hygiene-governance.test.ts
git commit -m "test: add repo hygiene governance"
```

### Task 3: Remove Deprecated Entrypoints, Unify Currency Hook Placement, And Delete Empty Dirs

**Files:**
- Delete: `src/modules/auth/helpers.ts`
- Delete: `src/modules/currency/services.ts`
- Delete: `src/modules/workspace/contracts.ts`
- Delete: `src/modules/currency/useConvertedAmount.ts`
- Delete: `src/modules/currency/useAmountDisplay.ts`
- Create: `src/modules/currency/hooks/useConvertedAmount.ts`
- Create: `src/modules/currency/hooks/useAmountDisplay.ts`
- Modify: `src/modules/currency/client.ts`
- Modify: `tests/unit/modules/currency/useConvertedAmount.test.ts`
- Modify: `tests/unit/modules/currency/useAmountDisplay.test.ts`
- Delete directory: `src/components/auth`
- Delete directory: `src/components/entries`
- Delete directory: `src/components/stats`

- [ ] **Step 1: Verify there are no runtime imports of the deprecated entry files**

Run: `rg -n "@/modules/auth/helpers|@/modules/currency/services|@/modules/workspace/contracts" src tests`
Expected: only governance/lint-string references remain; no runtime code imports should need migration.

- [ ] **Step 2: Move the currency hook implementations under `src/modules/currency/hooks/`**

Use this final structure:

```ts
// src/modules/currency/hooks/useConvertedAmount.ts
export function useConvertedAmount(...) { ... }

// src/modules/currency/hooks/useAmountDisplay.ts
import { useConvertedAmount } from "./useConvertedAmount";
export function useAmountDisplay(...) { ... }
```

- [ ] **Step 3: Point the public client entry at the moved implementations**

```ts
// src/modules/currency/client.ts
export { useConvertedAmount } from "./hooks/useConvertedAmount";
export { useAmountDisplay } from "./hooks/useAmountDisplay";
```

- [ ] **Step 4: Update the currency hook tests to import the new implementation paths**

For example:

```ts
import { useConvertedAmount } from "@/modules/currency/hooks/useConvertedAmount";
import { useAmountDisplay } from "@/modules/currency/hooks/useAmountDisplay";
vi.mock("@/modules/currency/hooks/useConvertedAmount", () => ({ ... }));
```

- [ ] **Step 5: Delete the deprecated files and remove the empty placeholder directories**

Delete:

- `src/modules/auth/helpers.ts`
- `src/modules/currency/services.ts`
- `src/modules/workspace/contracts.ts`
- `src/modules/currency/useConvertedAmount.ts`
- `src/modules/currency/useAmountDisplay.ts`

Remove directories:

- `src/components/auth`
- `src/components/entries`
- `src/components/stats`

- [ ] **Step 6: Run the focused governance and currency tests**

Run: `npm run test:unit -- tests/unit/tooling/repo-hygiene-governance.test.ts tests/unit/modules/currency/useConvertedAmount.test.ts tests/unit/modules/currency/useAmountDisplay.test.ts`
Expected: PASS

- [ ] **Step 7: Run lint on the touched currency and tooling files**

Run: `npm run lint -- src/modules/currency src/modules/auth src/modules/workspace tests/unit/tooling/repo-hygiene-governance.test.ts tests/unit/modules/currency/useConvertedAmount.test.ts tests/unit/modules/currency/useAmountDisplay.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/modules/currency/hooks/useConvertedAmount.ts \
  src/modules/currency/hooks/useAmountDisplay.ts \
  src/modules/currency/client.ts \
  tests/unit/modules/currency/useConvertedAmount.test.ts \
  tests/unit/modules/currency/useAmountDisplay.test.ts \
  tests/unit/tooling/repo-hygiene-governance.test.ts \
  src/modules/auth/helpers.ts \
  src/modules/currency/services.ts \
  src/modules/workspace/contracts.ts \
  src/modules/currency/useConvertedAmount.ts \
  src/modules/currency/useAmountDisplay.ts \
  src/components/auth \
  src/components/entries \
  src/components/stats
git commit -m "refactor: remove deprecated entry leftovers"
```

### Task 4: Add A Grandfathered Unit-Test Location Governance Ratchet

**Files:**
- Create: `tests/tooling/legacy-unit-test-allowlist.ts`
- Create: `tests/unit/tooling/unit-test-location-governance.test.ts`
- Modify: `docs/architecture/coding-patterns.md`

- [ ] **Step 1: Write the failing governance test**

```ts
import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { legacyUnitTestAllowlist } from "../../tooling/legacy-unit-test-allowlist";

function walk(dir: string, files: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else if (/\.test\.(ts|tsx)$/.test(entry.name))
      files.push(path.relative(process.cwd(), fullPath).replace(/\\/g, "/"));
  }
  return files;
}

describe("unit test location governance", () => {
  it("allows legacy module-owned unit tests only via the explicit grandfathered allowlist", () => {
    const allUnitTests = walk(path.join(process.cwd(), "tests/unit"));
    const legacyModuleTests = allUnitTests.filter((file) =>
      file.includes("/tests/unit/auth/") ||
      file.includes("/tests/unit/currency/") ||
      file.includes("/tests/unit/hooks/") ||
      file.includes("/tests/unit/ledger/") ||
      file.includes("/tests/unit/source-document/") ||
      file.includes("/tests/unit/stats/") ||
      file.includes("/tests/unit/task-queue/") ||
      file.includes("/tests/unit/workspace/")
    );

    expect(legacyModuleTests.sort()).toEqual(legacyUnitTestAllowlist.slice().sort());
  });
});
```

- [ ] **Step 2: Run the governance test to verify it fails**

Run: `npm run test:unit -- tests/unit/tooling/unit-test-location-governance.test.ts`
Expected: FAIL because the allowlist file does not exist yet.

- [ ] **Step 3: Create the exact grandfathered allowlist**

Example shape:

```ts
export const legacyUnitTestAllowlist = [
  "tests/unit/hooks/useSourceDocuments.test.ts",
  "tests/unit/workspace/get-ledger-page-bootstrap.test.ts",
  // ...
] as const;
```

The list should contain **exact file paths**, not directories. That way, migrating one touched test shrinks the list, and adding a new legacy-path test fails automatically.

- [ ] **Step 4: Add the durable rule to `coding-patterns.md`**

Add a concise rule under the testing section:

```md
- 新增模块归属的 unit test 一律放在 `tests/unit/modules/*`
- 旧路径下的模块测试只允许按 grandfathered allowlist 保留，并且该 allowlist 只能缩小，不能新增
```

- [ ] **Step 5: Re-run the governance test to verify it passes**

Run: `npm run test:unit -- tests/unit/tooling/unit-test-location-governance.test.ts`
Expected: PASS

- [ ] **Step 6: Run the tooling tests together**

Run: `npm run test:unit -- tests/unit/tooling/vitest-config-boundaries.test.ts tests/unit/tooling/repo-hygiene-governance.test.ts tests/unit/tooling/unit-test-location-governance.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add tests/tooling/legacy-unit-test-allowlist.ts \
  tests/unit/tooling/unit-test-location-governance.test.ts \
  docs/architecture/coding-patterns.md
git commit -m "test: ratchet unit test locations"
```

### Task 5: Do The One-Time Mechanical Formatting Sweep

**Files:**
- Modify: repo-wide formatting only

- [ ] **Step 1: Verify the current formatting debt is still present**

Run: `npm run format:check`
Expected: FAIL with Prettier warnings across many files.

- [ ] **Step 2: Run the mechanical formatter across the whole repository**

Run: `npm run format`
Expected: Prettier rewrites the repo with no manual code changes.

- [ ] **Step 3: Re-run the formatting check**

Run: `npm run format:check`
Expected: PASS

- [ ] **Step 4: Run lint after the formatting sweep**

Run: `npm run lint -- .`
Expected: PASS

- [ ] **Step 5: Commit the sweep as a standalone non-functional PR**

```bash
git add .
git commit -m "style: apply repo-wide prettier formatting"
```

## Final Verification

**Files:**
- Test: `tests/unit/tooling/vitest-config-boundaries.test.ts`
- Test: `tests/unit/tooling/repo-hygiene-governance.test.ts`
- Test: `tests/unit/tooling/unit-test-location-governance.test.ts`
- Test: `tests/unit/modules/currency/useConvertedAmount.test.ts`
- Test: `tests/unit/modules/currency/useAmountDisplay.test.ts`

- [ ] **Step 1: Run the focused repo-hygiene and tooling suite**

Run: `npm run test:unit -- tests/unit/tooling/vitest-config-boundaries.test.ts tests/unit/tooling/repo-hygiene-governance.test.ts tests/unit/tooling/unit-test-location-governance.test.ts tests/unit/modules/currency/useConvertedAmount.test.ts tests/unit/modules/currency/useAmountDisplay.test.ts`
Expected: PASS

- [ ] **Step 2: Re-run the original mixed-run smoke command**

Run: `npm run test:run -- tests/unit/lib/ratelimit.test.ts tests/integration/modules/stats/application/queries/get-enhanced-stats.test.ts`
Expected: PASS

- [ ] **Step 3: Verify repo-wide formatting and lint state**

Run: `npm run format:check && npm run lint -- .`
Expected: PASS

- [ ] **Step 4: Verify the deprecated leftovers are gone**

Run: `git diff --name-only -- src/modules/auth/helpers.ts src/modules/currency/services.ts src/modules/workspace/contracts.ts src/modules/currency/useConvertedAmount.ts src/modules/currency/useAmountDisplay.ts`
Expected: deleted paths only, no reintroduced replacements at the old locations.

- [ ] **Step 5: Commit any final verification adjustments**

```bash
git add .
git commit -m "chore: verify repo hygiene next batch"
```

## Notes For The Implementer

- Land Track D last. A repo-wide format sweep before other PRs merge will just maximize rebase pain.
- Do not add a touched-files formatting tool in the same batch. The repo already has a clear global `format` / `format:check` workflow; the problem is debt, not missing tooling.
- The test-location governance should be a ratchet, not a migration project. If a test is touched later, move it to `tests/unit/modules/*` and delete it from the allowlist then.
- The currency module should end this batch with one clear public client entry (`client.ts`) and no root-level hook implementation files left behind.
