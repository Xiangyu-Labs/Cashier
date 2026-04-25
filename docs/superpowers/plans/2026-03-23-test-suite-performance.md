# Test Suite Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the Vitest suite wall-clock runtime without weakening assertions, coverage, database isolation, or CI safety.

**Architecture:** Split the current one-size-fits-all Vitest setup into purpose-built projects so pure unit tests stop paying for integration-only bootstrapping, then remove the two biggest remaining hotspots: duplicated integration execution inside `test:unit` and repeated ESLint startup in the governance suite. Preserve behavior by validating exact test counts before and after each routing change and by keeping realistic Node/DOM/database environments where they are actually needed.

**Tech Stack:** Next.js 16, React 19, Vitest 4, happy-dom, better-sqlite3, Drizzle ORM, ESLint 9, npm

---

## Baseline

- `npm run test:unit` currently takes about `53.7s` wall time and accidentally executes `69` integration files (`420` assertions).
- `npm run test:integration` currently takes about `14.7s` wall time for `69` files and `420` assertions.
- `tests/unit/eslint/feature-boundaries.test.ts` is the single slowest file at about `24.4s`.
- `175 / 189` unit files appear not to need the database bootstrap in [`tests/setup.ts`](/home/dev/workspace/Cashier/tests/setup.ts).
- `68 / 69` integration files appear to be Node-only; only [`tests/integration/client/category-mutations-optimistic.test.tsx`](/home/dev/workspace/Cashier/tests/integration/client/category-mutations-optimistic.test.tsx) looks DOM-dependent.

## File Map

- Modify: [`package.json`](/home/dev/workspace/Cashier/package.json)
  - Keep developer-facing scripts stable while rerouting them to the correct Vitest configs.
- Create: [`vitest.shared.config.ts`](/home/dev/workspace/Cashier/vitest.shared.config.ts)
  - Shared aliases and coverage defaults consumed by the dedicated unit and integration configs.
- Modify: [`vitest.unit.config.ts`](/home/dev/workspace/Cashier/vitest.unit.config.ts)
  - Unit/governance routing only; must never match `tests/integration/**`.
- Create: [`vitest.integration.config.ts`](/home/dev/workspace/Cashier/vitest.integration.config.ts)
  - Integration-only routing, with a Node-default project and a tiny DOM-only project for the single client integration test.
- Create: [`tests/setup.common.ts`](/home/dev/workspace/Cashier/tests/setup.common.ts)
  - Shared environment variables and module mocks that all tests can reuse without pulling in the database.
- Create: [`tests/setup.dom.ts`](/home/dev/workspace/Cashier/tests/setup.dom.ts)
  - DOM-only cleanup and browser shims.
- Modify: [`tests/setup.ts`](/home/dev/workspace/Cashier/tests/setup.ts)
  - Keep database-backed helpers and setup for DB/integration projects only.
- Create: [`tests/unit/tooling/vitest-config-boundaries.test.ts`](/home/dev/workspace/Cashier/tests/unit/tooling/vitest-config-boundaries.test.ts)
  - Regression guard that prevents `test:unit` from regressing back to generic `tests/**/*.test.*` globs.
- Modify: [`tests/unit/eslint/feature-boundaries.test.ts`](/home/dev/workspace/Cashier/tests/unit/eslint/feature-boundaries.test.ts)
  - Preserve all governance assertions while reusing the `ESLint` instance.
- Modify: [`src/lib/logger.ts`](/home/dev/workspace/Cashier/src/lib/logger.ts)
  - Silence default runtime logging during tests unless explicitly opted back in.
- Modify: [`tests/integration/api/source-document-delete-race-condition.test.ts`](/home/dev/workspace/Cashier/tests/integration/api/source-document-delete-race-condition.test.ts)
  - Remove always-on debug `console.log` noise from a hot integration path.

## Success Metrics

- `npm run test:unit` executes only unit/governance files and reports the current unit baseline of `1089` assertions.
- `npm run test:integration` executes only integration files and reports the current integration baseline of `420` assertions.
- `npm run check` remains green.
- The test phase of `npm run check` drops below `45s` wall time on the same machine, with a stretch target below `35s`.

### Task 1: Split Unit Routing Away From Integration Globs

**Files:**
- Create: [`tests/unit/tooling/vitest-config-boundaries.test.ts`](/home/dev/workspace/Cashier/tests/unit/tooling/vitest-config-boundaries.test.ts)
- Create: [`vitest.shared.config.ts`](/home/dev/workspace/Cashier/vitest.shared.config.ts)
- Create: [`tests/setup.common.ts`](/home/dev/workspace/Cashier/tests/setup.common.ts)
- Modify: [`tests/setup.ts`](/home/dev/workspace/Cashier/tests/setup.ts)
- Modify: [`vitest.unit.config.ts`](/home/dev/workspace/Cashier/vitest.unit.config.ts)
- Modify: [`package.json`](/home/dev/workspace/Cashier/package.json)
- Test: [`tests/unit/tooling/vitest-config-boundaries.test.ts`](/home/dev/workspace/Cashier/tests/unit/tooling/vitest-config-boundaries.test.ts)

- [ ] **Step 1: Write the failing boundary regression test**

```ts
import { describe, expect, it } from "vitest";
import config from "../../../vitest.unit.config";

describe("vitest unit config boundaries", () => {
  it("does not include generic tests/** globs that also match integration files", () => {
    const include = config.test?.include ?? [];

    expect(include).not.toContain("tests/**/*.test.ts");
    expect(include).not.toContain("tests/**/*.test.tsx");
  });
});
```

- [ ] **Step 2: Run the regression test to verify it fails against the current config**

Run: `npm run test:unit -- tests/unit/tooling/vitest-config-boundaries.test.ts`
Expected: FAIL because the current merged unit config still inherits generic `tests/**/*.test.ts` and `tests/**/*.test.tsx` patterns from the base config.

- [ ] **Step 3: Create a shared Vitest base for aliases and coverage**

```ts
// vitest.shared.config.ts
import path from "path";

export const resolveAliases = {
  "@": path.resolve(__dirname, "src"),
  messages: path.resolve(__dirname, "messages"),
  tests: path.resolve(__dirname, "tests"),
};

export const coverageConfig = {
  provider: "v8",
  reporter: ["text", "json", "html"],
  exclude: ["node_modules", ".next", "tests", "src/**/*.test.ts", "src/**/*.test.tsx"],
};
```

- [ ] **Step 4: Extract common non-DB setup**

```ts
// tests/setup.common.ts
import { vi } from "vitest";

process.env.AI_MODEL_TEXT ??= "test-text-model";
process.env.AI_MODEL_VISION ??= "test-vision-model";
process.env.OPENAI_API_KEY ??= "test-openai-key";
```

Move the existing `vi.mock("@/auth" ...)`, `vi.mock("next-intl" ...)`, `vi.mock("next/image" ...)`, and `vi.mock("next/cache" ...)` blocks from [`tests/setup.ts`](/home/dev/workspace/Cashier/tests/setup.ts) into this file unchanged.

- [ ] **Step 5: Reduce [`tests/setup.ts`](/home/dev/workspace/Cashier/tests/setup.ts) to DB-backed behavior only**

```ts
// tests/setup.ts
import "./setup.common";
```

Keep the existing `dbInstances` map, `getCurrentTestFile()`, `getTestDb()`, `getTestClient()`, DB lifecycle hooks, and `vi.mock("@/lib/db" ...)` in this file. The only change in this step is that non-DB mocks and DOM cleanup code should no longer live here.

- [ ] **Step 6: Rewrite the unit config so heavy DB setup is opt-in instead of global**

```ts
// vitest.unit.config.ts
import { defineConfig, defineProject } from "vitest/config";
import { coverageConfig, resolveAliases } from "./vitest.shared.config";

const dbUnitFiles = [
  "tests/unit/auth/application/queries/get-session-user.test.ts",
  "tests/unit/auth/application/use-cases/registration-policy.test.ts",
  "tests/unit/auth/repositories/otp-repository.test.ts",
  "tests/unit/auth/services/otp-verification.test.ts",
  "tests/unit/db/ledger-entries.test.ts",
  "tests/unit/ledger/application/queries/get-ledger-entry-detail.test.ts",
  "tests/unit/ledger/application/queries/list-service-credentials.test.ts",
  "tests/unit/ledger/application/services/authenticate-service-credential.test.ts",
  "tests/unit/ledger/application/services/resolve-ledger-for-service-credential.test.ts",
  "tests/unit/ledger/application/tasks/categorize-entry.test.ts",
  "tests/unit/ledger/application/tasks/generate-category-metadata.test.ts",
  "tests/unit/ledger/application/use-cases/create-default-ledger.test.ts",
  "tests/unit/ledger/server/actions/delete.test.ts",
  "tests/unit/lib/auth-actions.test.ts",
];

export default defineConfig({
  resolve: {
    alias: resolveAliases,
  },
  test: {
    coverage: coverageConfig,
    projects: [
      defineProject({
        test: {
          name: "unit-general",
          include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["tests/integration/**", ...dbUnitFiles],
          environment: "happy-dom",
          setupFiles: ["./tests/setup.common.ts"],
          maxWorkers: "100%",
        },
      }),
      defineProject({
        test: {
          name: "unit-db",
          include: dbUnitFiles,
          environment: "node",
          setupFiles: ["./tests/setup.ts"],
          maxWorkers: "50%",
        },
      }),
      defineProject({
        test: {
          name: "governance",
          include: ["tests/unit/eslint/**/*.test.ts"],
          environment: "node",
          setupFiles: ["./tests/setup.common.ts"],
          fileParallelism: false,
        },
      }),
    ],
  },
});
```

- [ ] **Step 7: Point the unit script at the rewritten routing**

```json
{
  "scripts": {
    "test:unit": "vitest run --config vitest.unit.config.ts"
  }
}
```

- [ ] **Step 8: Run the boundary regression test again**

Run: `npm run test:unit -- tests/unit/tooling/vitest-config-boundaries.test.ts`
Expected: PASS

- [ ] **Step 9: Run the full unit suite and confirm integration files are gone**

Run: `npm run test:unit -- --reporter=json --outputFile=.tmp/test-reports/unit.after-routing.json`
Expected: PASS with no files from `tests/integration/**` in the JSON report and about `1089` unit assertions.

- [ ] **Step 10: Commit**

```bash
git add package.json vitest.shared.config.ts vitest.unit.config.ts tests/setup.common.ts tests/setup.ts tests/unit/tooling/vitest-config-boundaries.test.ts
git commit -m "test: stop unit suite from running integration files"
```

### Task 2: Give Integration Tests Their Own Node-First Config

**Files:**
- Create: [`vitest.integration.config.ts`](/home/dev/workspace/Cashier/vitest.integration.config.ts)
- Create: [`tests/setup.dom.ts`](/home/dev/workspace/Cashier/tests/setup.dom.ts)
- Modify: [`package.json`](/home/dev/workspace/Cashier/package.json)
- Test: [`tests/integration/client/category-mutations-optimistic.test.tsx`](/home/dev/workspace/Cashier/tests/integration/client/category-mutations-optimistic.test.tsx)

- [ ] **Step 1: Create a DOM-only setup file**

```ts
// tests/setup.dom.ts
import "./setup.common";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

(globalThis as typeof globalThis & { confirm?: typeof window.confirm }).confirm = vi.fn(() => true);
```

- [ ] **Step 2: Create a dedicated integration config with Node as the default environment**

```ts
// vitest.integration.config.ts
import { defineConfig, defineProject } from "vitest/config";
import { coverageConfig, resolveAliases } from "./vitest.shared.config";

export default defineConfig({
  resolve: {
    alias: resolveAliases,
  },
  test: {
    coverage: coverageConfig,
    projects: [
      defineProject({
        test: {
          name: "integration-node",
          include: ["tests/integration/**/*.test.ts", "tests/integration/**/*.test.tsx"],
          exclude: ["tests/integration/client/category-mutations-optimistic.test.tsx"],
          environment: "node",
          setupFiles: ["./tests/setup.ts"],
          maxWorkers: "50%",
        },
      }),
      defineProject({
        test: {
          name: "integration-dom",
          include: ["tests/integration/client/category-mutations-optimistic.test.tsx"],
          environment: "happy-dom",
          setupFiles: ["./tests/setup.dom.ts"],
          maxWorkers: 1,
        },
      }),
    ],
  },
});
```

- [ ] **Step 3: Point scripts at the dedicated integration config**

```json
{
  "scripts": {
    "test:integration": "vitest run --config vitest.integration.config.ts"
  }
}
```

- [ ] **Step 4: Run the DOM-only integration file to verify it still has browser APIs**

Run: `npm run test:integration -- tests/integration/client/category-mutations-optimistic.test.tsx`
Expected: PASS in the `integration-dom` project

- [ ] **Step 5: Run the full integration suite**

Run: `npm run test:integration -- --reporter=json --outputFile=.tmp/test-reports/integration.after-routing.json`
Expected: PASS with about `420` integration assertions and no accidental unit files

- [ ] **Step 6: Commit**

```bash
git add package.json vitest.integration.config.ts tests/setup.dom.ts
git commit -m "test: give integration suite a dedicated node-first config"
```

### Task 3: Remove The ESLint Governance Bottleneck

**Files:**
- Modify: [`tests/unit/eslint/feature-boundaries.test.ts`](/home/dev/workspace/Cashier/tests/unit/eslint/feature-boundaries.test.ts)
- Test: [`tests/unit/eslint/feature-boundaries.test.ts`](/home/dev/workspace/Cashier/tests/unit/eslint/feature-boundaries.test.ts)

- [ ] **Step 1: Preserve the current case inventory before refactoring**

```ts
const cases = [
  {
    name: "rejects legacy feature imports from module files",
    code: `import { getSourceDocumentsAction } from "@/features/source-document/server/actions/queries";`,
    filePath: "src/modules/ledger/application/tasks/categorize-entry.ts",
    expectedRuleCount: 1,
  },
];

it("keeps the full case inventory", () => {
  expect(cases).toHaveLength(76);
});
```

Populate `cases` by moving every current `it(...)` input pair into a row before deleting any existing assertion. Do not merge or simplify cases during this refactor.

- [ ] **Step 2: Run the governance file to confirm the existing baseline**

Run: `time npm run test:unit -- tests/unit/eslint/feature-boundaries.test.ts`
Expected: PASS and currently slow, roughly matching the `24.4s` report baseline

- [ ] **Step 3: Reuse one ESLint instance instead of rebuilding it for every case**

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { ESLint } from "eslint";

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({
    overrideConfigFile: `${process.cwd()}/eslint.config.mjs`,
  });
});

async function lintRestrictedImports(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => message.ruleId === "no-restricted-imports");
}
```

- [ ] **Step 4: Convert the file to table-driven cases without changing the assertions**

```ts
it.each(cases)("$name", async ({ code, filePath, expectedRuleCount }) => {
  const messages = await lintRestrictedImports(code, filePath);

  if (expectedRuleCount === 0) {
    expect(messages).toHaveLength(0);
  } else {
    expect(messages.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 5: Re-run the governance file and confirm it is materially faster**

Run: `time npm run test:unit -- tests/unit/eslint/feature-boundaries.test.ts`
Expected: PASS with the same case coverage and a large runtime drop relative to the baseline

- [ ] **Step 6: Commit**

```bash
git add tests/unit/eslint/feature-boundaries.test.ts
git commit -m "test: speed up feature boundary governance checks"
```

### Task 4: Silence Default Test Logging And Remove Always-On Console Noise

**Files:**
- Modify: [`src/lib/logger.ts`](/home/dev/workspace/Cashier/src/lib/logger.ts)
- Modify: [`tests/integration/api/source-document-delete-race-condition.test.ts`](/home/dev/workspace/Cashier/tests/integration/api/source-document-delete-race-condition.test.ts)
- Test: [`tests/unit/auth/services/notifications.test.ts`](/home/dev/workspace/Cashier/tests/unit/auth/services/notifications.test.ts)

- [ ] **Step 1: Add a test-default silent logger that can still be overridden for debugging**

```ts
// src/lib/logger.ts
const isTest = process.env.NODE_ENV === "test";
const explicitLevel = process.env.LOG_LEVEL;
const inferredLevel = isTest ? "silent" : isDev ? "debug" : "info";

export const logger = pino({
  level: explicitLevel ?? inferredLevel,
  // keep pretty transport only for local development
});
```

- [ ] **Step 2: Remove always-on debug `console.log` calls from the race-condition integration test**

```ts
const debug = process.env.DEBUG_TEST_LOGS === "1" ? console.log : () => {};

debug("T0: created ledger entry", payload);
debug("T2: background process soft-deleted the record");
```

- [ ] **Step 3: Run logger-sensitive unit tests to verify mocked logger assertions still pass**

Run: `npm run test:unit -- tests/unit/auth/services/notifications.test.ts tests/unit/auth/application/use-cases/send-otp.test.ts`
Expected: PASS

- [ ] **Step 4: Run the previously noisy integration file**

Run: `npm run test:integration -- tests/integration/api/source-document-delete-race-condition.test.ts`
Expected: PASS with far less stdout noise unless `DEBUG_TEST_LOGS=1` is set

- [ ] **Step 5: Commit**

```bash
git add src/lib/logger.ts tests/integration/api/source-document-delete-race-condition.test.ts
git commit -m "test: quiet default logging during suite execution"
```

### Task 5: Re-Profile The Suite And Trim Remaining DB Bootstrap Waste

**Files:**
- Modify if needed: [`tests/helpers/schema-setup.ts`](/home/dev/workspace/Cashier/tests/helpers/schema-setup.ts)
- Modify if needed: [`tests/setup.ts`](/home/dev/workspace/Cashier/tests/setup.ts)
- Test: [`tests/integration/modules/source-document/application/tasks/parse-source-document.test.ts`](/home/dev/workspace/Cashier/tests/integration/modules/source-document/application/tasks/parse-source-document.test.ts)

- [ ] **Step 1: Capture fresh JSON reports for both suites after Tasks 1-4**

Run: `npm run test:unit -- --reporter=json --outputFile=.tmp/test-reports/unit.final.json`
Expected: PASS

Run: `npm run test:integration -- --reporter=json --outputFile=.tmp/test-reports/integration.final.json`
Expected: PASS

- [ ] **Step 2: Compare counts and verify no regression in scope**

Run: `node -e "const fs=require('fs'); const u=JSON.parse(fs.readFileSync('.tmp/test-reports/unit.final.json','utf8')); const i=JSON.parse(fs.readFileSync('.tmp/test-reports/integration.final.json','utf8')); console.log({unit:u.numPassedTests,integration:i.numPassedTests});"`
Expected: `{ unit: 1089, integration: 420 }` unless intentional new tests were added during implementation

- [ ] **Step 3: Check whether DB bootstrap is still the dominant integration cost**

Run: `node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync('.tmp/test-reports/integration.final.json','utf8')); console.log(r.testResults.sort((a,b)=>(b.endTime-b.startTime)-(a.endTime-a.startTime)).slice(0,10).map(f=>({name:f.name,duration:f.endTime-f.startTime})));"`
Expected: A ranked list of slow integration files

- [ ] **Step 4: Only if integration runtime is still above target, remove the redundant pre-migration table drop loop**

```ts
// tests/helpers/schema-setup.ts
export async function createTestSchema(db: BetterSQLite3Database<typeof schema>) {
  await migrate(db, { migrationsFolder: "src/persistence/migrations" });
}
```

This is safe because [`tests/setup.ts`](/home/dev/workspace/Cashier/tests/setup.ts) already creates a fresh `new Database(":memory:")` for each test file, so dropping tables before the first migration does unnecessary work.

- [ ] **Step 5: Re-run the slowest integration files if the schema bootstrap shortcut was implemented**

Run: `npm run test:integration -- tests/integration/modules/source-document/application/tasks/parse-source-document.test.ts tests/integration/flow/flow-engine.test.ts`
Expected: PASS and measurably faster than the pre-template baseline

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/schema-setup.ts tests/setup.ts
git commit -m "test: trim redundant schema bootstrap work"
```

### Task 6: Final Verification And Handoff

**Files:**
- Modify if needed: [`README.md`](/home/dev/workspace/Cashier/README.md)
- Create if needed: [`docs/testing/2026-03-23-test-suite-commands.md`](/home/dev/workspace/Cashier/docs/testing/2026-03-23-test-suite-commands.md)

- [ ] **Step 1: Run the full verification command that CI uses**

Run: `npm run check`
Expected: PASS

- [ ] **Step 2: Record the before/after suite timings in the PR description or implementation notes**

```md
- Before:
  - test:unit ~53.7s
  - test:integration ~14.7s
- After:
  - test:unit <target>
  - test:integration <target>
```

- [ ] **Step 3: Update any developer docs that mention the old test entrypoints if scripts changed**

```md
## Test Commands

- `npm run test:unit` runs unit, DB-backed unit, and governance projects
- `npm run test:integration` runs integration-only projects
- `DEBUG_TEST_LOGS=1 npm run test:integration -- <file>` re-enables verbose debugging when needed
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/testing/2026-03-23-test-suite-commands.md
git commit -m "docs: document optimized test suite commands"
```
