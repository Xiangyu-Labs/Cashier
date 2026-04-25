# ESLint Boundaries Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the repo's ESLint boundary rules so they enforce one consistent module-import policy, close the relative-import escape hatches, and normalize test imports onto the same `@/` alias path used by production code.

**Architecture:** The repo already uses `no-restricted-imports` as an architecture guardrail, not just a style rule. We will keep that strategy, but replace the current patch-by-patch restrictions with one central module-boundary manifest plus shared pattern builders for public entrypoints, internal layers, and relative escape hatches. Tests will be brought onto the same alias-based import surface so existing module-boundary rules apply uniformly instead of being bypassed by `../../src/...` paths.

**Tech Stack:** ESLint 9 flat config, `eslint-config-next`, TypeScript path aliases, Vitest governance tests, Next.js 16

---

### Task 1: Lock The Current Escape Hatches With Failing Governance Tests

**Files:**
- Modify: `tests/unit/eslint/feature-boundaries.test.ts`

- [ ] **Step 1: Write the failing test for relative `src` imports inside tests**

```ts
it("rejects relative src imports from tests", async () => {
  const messages = await lintRestrictedImports(
    `
      import { getTaskQueueQuery } from "../../../../../../src/modules/task-queue/application/queries/get-task-queue";
      export const leak = getTaskQueueQuery;
    `,
    "tests/integration/modules/task-queue/application/queries/get-task-queue.test.ts"
  );

  expect(messages.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Write the failing test for cross-module relative imports from module files**

```ts
it("rejects cross-module relative imports from module files", async () => {
  const messages = await lintRestrictedImports(
    `
      import { getPendingSourceDocuments } from "../../source-document/queries";
      export const leak = getPendingSourceDocuments;
    `,
    "src/modules/ledger/application/use-cases/mutate-ledger-entries.ts"
  );

  expect(messages.length).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Write the passing control test for same-module relative imports**

```ts
it("allows same-module relative imports", async () => {
  const messages = await lintRestrictedImports(
    `
      import { mapLedgerEntryDto } from "../mappers";
      export const value = mapLedgerEntryDto;
    `,
    "src/modules/ledger/application/queries/list-ledger-entry-page.ts"
  );

  expect(messages).toHaveLength(0);
});
```

- [ ] **Step 4: Run the governance test to verify the new cases fail**

Run: `npm run test:unit -- tests/unit/eslint/feature-boundaries.test.ts`
Expected: FAIL on the new relative-import assertions because the current config still allows those escape paths

- [ ] **Step 5: Commit**

```bash
git add tests/unit/eslint/feature-boundaries.test.ts
git commit -m "test: cover eslint boundary escape hatches"
```

### Task 2: Refactor ESLint Boundaries Into One Manifest-Driven Rule Builder

**Files:**
- Modify: `eslint.config.mjs`
- Test: `tests/unit/eslint/feature-boundaries.test.ts`

- [ ] **Step 1: Replace the current patchwork constants with a single boundary manifest**

```js
const MODULE_BOUNDARIES = {
  auth: {
    publicEntrypoints: ["access", "actions", "constants", "contract-schemas", "contracts", "errors", "queries", "use-cases", "hooks", "ui"],
    deprecatedEntrypoints: ["helpers", "services"],
  },
  ledger: {
    publicEntrypoints: ["access", "actions", "contract-schemas", "contracts", "credential-access", "hooks", "queries", "source-document-queries", "use-cases", "ui"],
    deprecatedEntrypoints: ["mappers", "tasks"],
  },
  // ...
};
```

- [ ] **Step 2: Add shared builders for alias-only cross-module imports and relative escape patterns**

```js
function createRelativeSiblingModulePatterns(targetModules, maxDepth = 6) {
  return targetModules.flatMap((moduleName) =>
    Array.from({ length: maxDepth }, (_, index) => {
      const prefix = "../".repeat(index + 1);
      return {
        group: [`${prefix}${moduleName}`, `${prefix}${moduleName}/**`],
        message: `Cross-module imports must use "@/modules/${moduleName}/<public-entrypoint>" instead of relative paths.`,
      };
    })
  );
}

function createRelativeSrcPatterns(maxDepth = 8) {
  return Array.from({ length: maxDepth }, (_, index) => {
    const prefix = "../".repeat(index + 1);
    return `${prefix}src/**`;
  });
}
```

- [ ] **Step 3: Generate all `no-restricted-imports` rules from the same helpers**

```js
function createCrossModuleBoundaryOptions(currentModule) {
  const disallowedModules = moduleNames.filter((moduleName) => moduleName !== currentModule);

  return {
    patterns: [
      ...createLegacyFeaturePatterns(),
      ...createExplicitModuleBoundaryPatterns(disallowedModules),
      ...createDeepModuleImportPatterns(disallowedModules),
      ...createRelativeSiblingModulePatterns(disallowedModules),
    ],
    paths: [
      ...createModuleRootImportRestrictions(disallowedModules),
      ...createFacadeRestrictions(currentModule),
    ],
  };
}
```

- [ ] **Step 4: Add test-file restrictions for relative `src` imports**

```js
{
  files: ["tests/**/*.ts", "tests/**/*.tsx"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [...],
        patterns: [
          ...createExplicitModuleBoundaryPatterns(moduleNames),
          ...createDeepModuleImportPatterns(moduleNames),
          {
            group: createRelativeSrcPatterns(),
            message: 'Tests must import source files through "@/..." aliases instead of relative "src" paths.',
          },
        ],
      },
    ],
  },
}
```

- [ ] **Step 5: Run the governance test to verify the new rules pass**

Run: `npm run test:unit -- tests/unit/eslint/feature-boundaries.test.ts`
Expected: PASS with the new relative-import cases covered

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs tests/unit/eslint/feature-boundaries.test.ts
git commit -m "refactor: unify eslint boundary generation"
```

### Task 3: Normalize Test Imports Onto `@/` Aliases

**Files:**
- Modify: all test files returned by `rg -l 'from "[.][.]/|from '\''[.][.]/|import "[.][.]/|import '\''[.][.]/' tests | xargs rg -l 'src/'`
- Test: representative unit and integration files that currently import `../../src/...`

- [ ] **Step 1: Replace every relative `src` import in tests with the matching `@/` alias**

```ts
// before
import { batchConvertCurrencyAction } from "../../src/modules/currency/actions";

// after
import { batchConvertCurrencyAction } from "@/modules/currency/actions";
```

- [ ] **Step 2: Keep local test helpers on relative paths and `tests/*` imports untouched**

```ts
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { batchConvertCurrencyAction } from "@/modules/currency/actions";
```

- [ ] **Step 3: Run targeted test slices that cover the rewritten import shapes**

Run: `npm run test:unit -- tests/unit/currency/actions.test.ts tests/unit/workspace/ledger-url-navigation.test.ts tests/unit/modules/source-document/application/queries/get-source-document-light.test.ts`
Expected: PASS

Run: `npm run test:integration -- tests/integration/api/currency-actions.test.ts tests/integration/auth/registration.test.ts tests/integration/modules/task-queue/application/queries/get-task-queue.test.ts`
Expected: PASS

- [ ] **Step 4: Run a repository-wide search to confirm no relative `src` imports remain in tests**

Run: `rg -n 'from ["'\''](\\.\\./)+src/|import ["'\''](\\.\\./)+src/' tests`
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add tests
git commit -m "refactor: align test imports with module aliases"
```

### Task 4: Final Verification And Boundary Intent Check

**Files:**
- Modify: `eslint.config.mjs` if verification reveals an over-restrictive pattern
- Test: `tests/unit/eslint/feature-boundaries.test.ts`

- [ ] **Step 1: Run the governance suite and the tooling guard**

Run: `npm run test:unit -- tests/unit/eslint/feature-boundaries.test.ts tests/unit/tooling/vitest-config-boundaries.test.ts`
Expected: PASS

- [ ] **Step 2: Run ESLint on the config plus the touched tests**

Run: `npx eslint eslint.config.mjs tests/unit/eslint/feature-boundaries.test.ts $(git diff --name-only -- tests | tr '\n' ' ')`
Expected: PASS for touched files

- [ ] **Step 3: Sanity-check the three intended outcomes**

```text
1. Cross-module imports only use "@/modules/<module>/<public-entrypoint>".
2. Same-module implementation imports may stay relative.
3. Tests never reach into source via "../../src/..." and therefore cannot bypass boundary rules.
```

- [ ] **Step 4: Commit**

```bash
git add eslint.config.mjs tests/unit/eslint/feature-boundaries.test.ts tests
git commit -m "chore: enforce unified eslint import boundaries"
```
