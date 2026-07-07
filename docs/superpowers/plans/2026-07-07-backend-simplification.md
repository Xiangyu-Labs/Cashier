# Backend Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggressively simplify Cashier backend internals while preserving user-visible workflows, API v1 contracts, persisted data semantics, auth boundaries, task behavior, and AI parsing outcomes.

**Architecture:** Keep security, DTO, API, and active AI parsing boundaries, but remove speculative framework layers and redundant module entry points. The refactor proceeds behavior-first: governance tests define removals, focused tests protect env/task/query/orchestration behavior, and implementation updates imports after each internal boundary is flattened.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Drizzle ORM, SQLite, NextAuth, Zod, OpenAI SDK.

---

## File Structure

- Create: `tests/unit/architecture/backend-simplification.test.ts`  
  Governance tests for deleted compatibility modules, forbidden production imports, and import-time orchestration side effects.
- Modify: `src/modules/workspace/ui/LedgerEntriesCompletedGroups.tsx`  
  Replace `@/lib/serialization` type import with source-document contract import.
- Modify: `src/modules/ledger/hooks/useGroupedEntries.ts`  
  Replace `@/lib/serialization` type import with source-document contract import.
- Delete: `src/lib/ai/dual-gpt-runner.ts`  
  Remove unused parallel AI arbitration framework.
- Delete: `src/lib/serialization/index.ts`, `src/lib/serialization/types.ts`, `src/lib/serialization/utils.ts`  
  Remove unused generic serialization layer.
- Delete: `src/lib/storage/memory.ts`, `tests/unit/lib/storage/memory.test.ts`  
  Remove test-only storage provider from production source.

- Modify: `src/lib/env/startup.ts`  
  Make env defaults, schema fields, startup validation, and single-field access live together.
- Modify: `src/lib/env/catalog.ts`  
  Keep env key documentation only; remove runtime defaults and validation flags.
- Modify: `src/lib/env/runtime.ts`  
  Keep thin typed accessors backed by `startup.ts`.
- Modify: `src/lib/env/public.ts`  
  Keep direct `process.env.NEXT_PUBLIC_*` reads for browser inlining while using defaults exported by `startup.ts`.
- Delete: `src/lib/flow/config.ts`, `tests/unit/lib/flow/config.test.ts`  
  Remove separate flow runtime env parser.
- Modify: `tests/unit/lib/env/catalog.test.ts`, `tests/unit/lib/env/public-source.test.ts`, `tests/unit/lib/env/runtime.test.ts`, `tests/unit/lib/env/startup.test.ts`  
  Update env tests to assert single-source defaults and browser-compatible public reads.

- Modify: `src/lib/flow/types.ts`  
  Remove generic storage/runtime adapter types; keep task, handler, AI, and context contracts.
- Modify: `src/lib/flow/engine.ts`  
  Make engine persist directly through Drizzle and `task_runs`.
- Modify: `src/lib/flow/runtime.ts`  
  Initialize the Cashier task engine directly with Drizzle persistence and AI context.
- Modify: `src/lib/flow/task-registry.ts`  
  Keep explicit centralized task registration without generic runtime reset shape.
- Delete: `src/lib/flow/adapters/drizzle-storage.ts`  
  Remove adapter layer.
- Modify: `src/lib/flow/index.ts`  
  Export the simplified task-engine surface.
- Modify: `tests/integration/flow/basic-flow.test.ts`
- Modify: `tests/integration/flow/deduplication.test.ts`
- Modify: `tests/integration/flow/flow-engine.test.ts`
- Modify: `tests/integration/flow/on-cancel.test.ts`
- Modify: `tests/integration/flow/pending-cancel.test.ts`
- Modify: `tests/unit/lib/flow/runtime.test.ts`
- Modify: `tests/unit/lib/flow/task-registry.test.ts`  
  Rewrite tests from adapter-shape assertions to task behavior assertions.

- Modify: `src/modules/source-document/application/queries/list-source-document-page.ts`
- Modify: `src/modules/source-document/application/queries/list-source-document-collection.ts`
- Modify: `src/modules/source-document/application/queries/source-document-queries.ts`
- Delete: `src/modules/source-document/queries.ts`
- Modify: `src/modules/source-document/server-actions/queries.ts`
- Modify: `src/app/api/v1/source-documents/route.ts`
- Modify: `tests/unit/modules/source-document/application/queries/can-access-source-document-upload.test.ts`
- Modify: `tests/unit/modules/source-document/application/queries/focused-source-document-queries.test.ts`
- Modify: `tests/unit/modules/source-document/application/queries/get-pending-source-documents.test.ts`
- Modify: `tests/unit/modules/source-document/application/queries/get-source-document-detail.test.ts`
- Modify: `tests/unit/modules/source-document/application/queries/get-source-document-light.test.ts`
- Modify: `tests/unit/modules/source-document/application/queries/source-document-processing.test.ts`
- Modify: `tests/unit/modules/source-document/application/queries/source-document-query-cursor.test.ts`
- Modify: `tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
  Collapse source-document query wrappers and update imports.

- Delete: `src/modules/ledger/queries.ts`
- Delete: `src/modules/ledger/use-cases.ts`
- Modify: `src/modules/ledger/server-actions/categories.ts`
- Modify: `src/modules/ledger/server-actions/categorize.ts`
- Modify: `src/modules/ledger/server-actions/create.ts`
- Modify: `src/modules/ledger/server-actions/credentials.ts`
- Modify: `src/modules/ledger/server-actions/delete.ts`
- Modify: `src/modules/ledger/server-actions/entries.ts`
- Modify: `src/modules/ledger/server-actions/export.ts`
- Modify: `src/modules/ledger/server-actions/get.ts`
- Modify: `src/modules/ledger/server-actions/get-entry.ts`
- Modify: `src/modules/ledger/server-actions/settings.ts`
- Modify: `src/modules/ledger/server-actions/stats.ts`
- Modify: `src/modules/ledger/server-actions/update.ts`
- Modify: `src/modules/workspace/application/use-cases/ensure-user-ledger.ts`
- Modify: `src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts`
- Modify: `src/app/api/v1/categories/route.ts`
- Modify: `src/app/api/v1/entries/route.ts`
- Modify: `src/app/api/v1/stats/route.ts`
- Modify: `tests/unit/workspace/ensure-user-ledger.test.ts`
- Modify: `tests/unit/workspace/get-ledger-page-bootstrap.test.ts`
- Modify: `tests/unit/ledger/server-actions/get-entry.test.ts`
- Modify: `tests/unit/ledger/server-actions-omission.test.ts`
- Modify: `tests/unit/modules/ledger/server-actions/validation.test.ts`
- Modify: `tests/unit/api/v1/ledger-query-routes-omission.test.ts`
- Modify: `tests/unit/api/v1/public-contract-routes.test.ts`
- Modify: `tests/unit/api/v1/source-documents-route-omission.test.ts`
- Modify: `tests/integration/api/entry-categories.test.ts`
- Modify: `tests/integration/api/ledger-entries.test.ts`
- Modify: `tests/integration/api/processing-stats.test.ts`
- Modify: `tests/integration/api/source-documents-route.test.ts`
- Modify: `tests/integration/api/v1-query-endpoints.test.ts`
- Modify: `tests/integration/ledger-search.test.ts`
- Modify: `tests/integration/ledger/ledger-single-owner-race-and-rollback.test.ts`
  Flatten ledger query/use-case barrels where callers can import concrete domain functions.

- Modify: `src/instrumentation.ts`
- Modify: `src/lib/orchestration/exchange-rate-ledger-recalculation.ts`
- Modify: `src/modules/source-document/application/use-cases/create-quick-entry.ts`
- Modify: `src/modules/source-document/application/parse-source-document/entry-builder.ts`
- Modify: `src/modules/ledger/application/use-cases/mutate-ledger-entries.ts`
- Modify: `src/modules/ledger/application/services/recalculate-entries-converted-amount.ts`
- Modify: `tests/unit/instrumentation.test.ts`, `tests/integration/exchange-rate-ledger-recalculation.test.ts`
  Move exchange-rate orchestration initialization to explicit bootstrap.

---

### Task 1: Delete Dead And Parallel Abstractions

**Files:**
- Create: `tests/unit/architecture/backend-simplification.test.ts`
- Modify: `src/modules/workspace/ui/LedgerEntriesCompletedGroups.tsx`
- Modify: `src/modules/ledger/hooks/useGroupedEntries.ts`
- Delete: `src/lib/ai/dual-gpt-runner.ts`
- Delete: `src/lib/serialization/index.ts`
- Delete: `src/lib/serialization/types.ts`
- Delete: `src/lib/serialization/utils.ts`
- Delete: `src/lib/storage/memory.ts`
- Delete: `tests/unit/lib/storage/memory.test.ts`

- [ ] **Step 1: Write the failing governance test**

Create `tests/unit/architecture/backend-simplification.test.ts`:

```typescript
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === "node_modules" || entry === ".next") return [];
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectSourceFiles(fullPath);
    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

describe("backend simplification governance", () => {
  it("removes unused compatibility modules from production source", () => {
    const removedPaths = [
      "src/lib/ai/dual-gpt-runner.ts",
      "src/lib/serialization/index.ts",
      "src/lib/serialization/types.ts",
      "src/lib/serialization/utils.ts",
      "src/lib/storage/memory.ts",
    ];

    for (const relativePath of removedPaths) {
      expect(existsSync(path.resolve(repoRoot, relativePath)), relativePath).toBe(false);
    }
  });

  it("does not import removed compatibility modules from source files", () => {
    const forbiddenImports = [
      "@/lib/serialization",
      "@/lib/ai/dual-gpt-runner",
      "@/lib/storage/memory",
    ];
    const offenders: string[] = [];

    for (const file of collectSourceFiles(path.resolve(repoRoot, "src"))) {
      const source = readFileSync(file, "utf8");
      for (const forbiddenImport of forbiddenImports) {
        if (source.includes(forbiddenImport)) {
          offenders.push(`${path.relative(repoRoot, file)} imports ${forbiddenImport}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/unit/architecture/backend-simplification.test.ts
```

Expected: FAIL because `src/lib/ai/dual-gpt-runner.ts`, `src/lib/serialization/*`, and `src/lib/storage/memory.ts` still exist, and source files still import `@/lib/serialization`.

- [ ] **Step 3: Replace serialization imports with domain contracts**

In `src/modules/workspace/ui/LedgerEntriesCompletedGroups.tsx`, replace:

```typescript
import type { SourceDocumentGroup } from "@/lib/serialization";
```

with:

```typescript
import type { SourceDocumentGroupDto as SourceDocumentGroup } from "@/modules/source-document/contracts";
```

In `src/modules/ledger/hooks/useGroupedEntries.ts`, replace:

```typescript
import type { SourceDocumentGroup } from "@/lib/serialization";
```

with:

```typescript
import type { SourceDocumentGroupDto as SourceDocumentGroup } from "@/modules/source-document/contracts";
```

- [ ] **Step 4: Delete unused compatibility files**

Delete:

```bash
src/lib/ai/dual-gpt-runner.ts
src/lib/serialization/index.ts
src/lib/serialization/types.ts
src/lib/serialization/utils.ts
src/lib/storage/memory.ts
tests/unit/lib/storage/memory.test.ts
```

- [ ] **Step 5: Run focused verification**

Run:

```bash
npx vitest run tests/unit/architecture/backend-simplification.test.ts tests/unit/lib/storage/local.test.ts tests/unit/lib/storage/utils.test.ts
npm run tsc
```

Expected: PASS. If TypeScript reports imports from deleted files, update those imports to domain contracts or active production modules.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/architecture/backend-simplification.test.ts src/modules/workspace/ui/LedgerEntriesCompletedGroups.tsx src/modules/ledger/hooks/useGroupedEntries.ts
git add -u src/lib/ai src/lib/serialization src/lib/storage tests/unit/lib/storage
git commit -m "refactor: remove unused backend compatibility layers"
```

---

### Task 2: Consolidate Environment Configuration

**Files:**
- Modify: `src/lib/env/startup.ts`
- Modify: `src/lib/env/catalog.ts`
- Modify: `src/lib/env/runtime.ts`
- Modify: `src/lib/env/public.ts`
- Delete: `src/lib/flow/config.ts`
- Delete: `tests/unit/lib/flow/config.test.ts`
- Modify: `src/lib/flow/runtime.ts`
- Modify: `src/lib/flow/index.ts`
- Modify: `tests/unit/lib/env/catalog.test.ts`
- Modify: `tests/unit/lib/env/public-source.test.ts`
- Modify: `tests/unit/lib/env/runtime.test.ts`
- Modify: `tests/unit/lib/env/startup.test.ts`

- [ ] **Step 1: Write failing single-source env tests**

Add these assertions to `tests/unit/lib/env/catalog.test.ts`:

```typescript
it("keeps runtime defaults out of the documentation catalog", () => {
  const catalogSource = readFileSync(path.resolve("src/lib/env/catalog.ts"), "utf8");

  expect(catalogSource).not.toContain("defaultValue");
  expect(catalogSource).not.toContain("validateOnStartup");
});
```

Add these assertions to `tests/unit/lib/env/public-source.test.ts`:

```typescript
it("uses shared documented defaults while keeping direct NEXT_PUBLIC reads", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/env/public.ts"), "utf8");

  expect(source).toContain("process.env.NEXT_PUBLIC_APP_URL");
  expect(source).toContain("process.env.NEXT_PUBLIC_OIDC_ENABLED");
  expect(source).toContain("process.env.NEXT_PUBLIC_OIDC_BUTTON_NAME");
  expect(source).toContain("ENV_DEFAULTS.NEXT_PUBLIC_APP_URL");
  expect(source).toContain("ENV_DEFAULTS.NEXT_PUBLIC_OIDC_ENABLED");
  expect(source).toContain("ENV_DEFAULTS.NEXT_PUBLIC_OIDC_BUTTON_NAME");
});
```

Add this test to `tests/unit/lib/env/startup.test.ts`:

```typescript
it("exports the default values used by startup, runtime, and public env readers", () => {
  expect(ENV_DEFAULTS.DATABASE_URL).toBe("file:./data/sqlite.db");
  expect(ENV_DEFAULTS.OPENAI_BASE_URL).toBe("https://api.openai.com/v1");
  expect(ENV_DEFAULTS.AI_MODEL_TEXT).toBe("gpt-4o-mini");
  expect(ENV_DEFAULTS.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  expect(ENV_DEFAULTS.NEXT_PUBLIC_OIDC_BUTTON_NAME).toBe("SSO");
});
```

Update the existing startup test import to include `ENV_DEFAULTS`:

```typescript
import { ENV_DEFAULTS, validateStartupEnv } from "@/lib/env/startup";
```

- [ ] **Step 2: Run env tests to verify they fail**

Run:

```bash
npx vitest run tests/unit/lib/env/catalog.test.ts tests/unit/lib/env/public-source.test.ts tests/unit/lib/env/startup.test.ts tests/unit/lib/env/runtime.test.ts tests/unit/lib/flow/config.test.ts
```

Expected: FAIL because `catalog.ts` still owns `defaultValue`, `public.ts` still hand-writes defaults, and `src/lib/flow/config.ts` still exists.

- [ ] **Step 3: Move defaults into `startup.ts`**

In `src/lib/env/startup.ts`, add an exported defaults object before schema helper functions:

```typescript
export const ENV_DEFAULTS = {
  DATABASE_URL: "file:./data/sqlite.db",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  AUTH_URL: "http://localhost:3000",
  LOCAL_STORAGE_PATH: "./data/uploads",
  TZ: "Asia/Shanghai",
  AI_MODEL_TEXT: "gpt-4o-mini",
  AI_MODEL_VISION: "gpt-4o",
  AI_MAX_RETRIES: "3",
  AI_RETRY_DELAY_MS: "1000",
  AI_TEMPERATURE: "0.3",
  SOURCE_DOC_STALE_TIME_MS: "120000",
  CURRENCY_STALE_TIME_MS: "14400000",
  OTP_EXPIRES_SECONDS: "300",
  OTP_LOCKOUT_MINUTES: "15",
  OTP_MAX_ATTEMPTS: "5",
  OTP_RESEND_COOLDOWN_SECONDS: "60",
  AUTH_RATE_LIMIT_MAX: "10",
  AUTH_RATE_LIMIT_WINDOW: "900",
  API_RATE_LIMIT_PER_MINUTE: "60",
  OTP_IP_MAX_ATTEMPTS_PER_HOUR: "10",
  OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE: "5",
  SESSION_MAX_AGE_DAYS: "14",
  DISABLE_REGISTRATION: "false",
  AUTH_EMAIL_FROM: DEFAULT_AUTH_EMAIL_FROM,
  MAX_TASK_WORKER: "10",
  EXPORT_MAX_ENTRIES: "2000",
  MAX_INPUT_PIXELS: "25000000",
  MAX_IMAGE_QUALITY: "85",
  LOG_LEVEL: "info",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_OIDC_ENABLED: "false",
  NEXT_PUBLIC_OIDC_BUTTON_NAME: "SSO",
} as const;
```

Replace the existing `getDefaultString` implementation with:

```typescript
function getDefaultString(name: keyof typeof ENV_DEFAULTS): string {
  return ENV_DEFAULTS[name];
}
```

Keep `getStartupEnvValue` and `validateStartupEnv` exported from this file so callers keep one env validation path.

- [ ] **Step 4: Reduce `catalog.ts` to documentation metadata**

Change `EnvCatalogEntry` in `src/lib/env/catalog.ts` to:

```typescript
export interface EnvCatalogEntry {
  name: string;
  tier: EnvTier;
  required: boolean;
  description: string;
}
```

Remove every `defaultValue` and `validateOnStartup` property from `APP_ENV_CATALOG`.

Remove `getEnvValue`. Keep `APP_ENV_CATALOG_BY_NAME` and `getEnvCatalogEntry` for documentation/governance.

- [ ] **Step 5: Update `public.ts` to use shared defaults and direct env reads**

In `src/lib/env/public.ts`, import defaults:

```typescript
import { ENV_DEFAULTS } from "./startup";
```

Use direct `process.env.NEXT_PUBLIC_*` reads with shared defaults:

```typescript
export const publicEnv: PublicEnv = {
  get appUrl() {
    return resolvePublicValue(process.env.NEXT_PUBLIC_APP_URL, ENV_DEFAULTS.NEXT_PUBLIC_APP_URL);
  },
  get oidcEnabled() {
    return (
      resolvePublicValue(
        process.env.NEXT_PUBLIC_OIDC_ENABLED,
        ENV_DEFAULTS.NEXT_PUBLIC_OIDC_ENABLED
      ) === "true"
    );
  },
  get oidcButtonName() {
    return resolvePublicValue(
      process.env.NEXT_PUBLIC_OIDC_BUTTON_NAME,
      ENV_DEFAULTS.NEXT_PUBLIC_OIDC_BUTTON_NAME
    );
  },
};
```

- [ ] **Step 6: Remove separate flow config parser**

Delete:

```bash
src/lib/flow/config.ts
tests/unit/lib/flow/config.test.ts
```

In `src/lib/flow/runtime.ts`, replace `loadFlowRuntimeEnvConfig()` usage with direct `runtimeEnv` reads:

```typescript
import { runtimeEnv } from "@/lib/env/runtime";

// inside initializeDefaultFlowRuntime()
maxConcurrentTasks: runtimeEnv.maxTaskWorker,
ai: {
  getClient: () => client,
  models: {
    text: runtimeEnv.aiModelText,
    vision: runtimeEnv.aiModelVision,
  },
},
```

Add `aiModelText`, `aiModelVision`, and `maxTaskWorker` accessors to `src/lib/env/runtime.ts` backed by `getStartupEnvValue`.

- [ ] **Step 7: Run focused verification**

Run:

```bash
npx vitest run tests/unit/lib/env/catalog.test.ts tests/unit/lib/env/public-source.test.ts tests/unit/lib/env/startup.test.ts tests/unit/lib/env/runtime.test.ts tests/unit/instrumentation.test.ts
npm run tsc
```

Expected: PASS. If client-side public env tests fail because `public.ts` no longer has direct `process.env.NEXT_PUBLIC_*` reads, restore direct reads while keeping shared defaults.

- [ ] **Step 8: Commit**

```bash
git add src/lib/env tests/unit/lib/env src/lib/flow/runtime.ts src/lib/flow/index.ts tests/unit/instrumentation.test.ts
git add -u src/lib/flow/config.ts tests/unit/lib/flow/config.test.ts
git commit -m "refactor: consolidate environment configuration"
```

---

### Task 3: Specialize The Task Engine For Cashier

**Files:**
- Modify: `src/lib/flow/types.ts`
- Modify: `src/lib/flow/engine.ts`
- Modify: `src/lib/flow/runtime.ts`
- Modify: `src/lib/flow/task-registry.ts`
- Modify: `src/lib/flow/index.ts`
- Delete: `src/lib/flow/adapters/drizzle-storage.ts`
- Modify: `tests/integration/flow/basic-flow.test.ts`
- Modify: `tests/integration/flow/flow-engine.test.ts`
- Modify: `tests/integration/flow/deduplication.test.ts`
- Modify: `tests/integration/flow/on-cancel.test.ts`
- Modify: `tests/integration/flow/pending-cancel.test.ts`
- Modify: `tests/unit/lib/flow/runtime.test.ts`
- Modify: `tests/unit/lib/flow/task-registry.test.ts`

- [ ] **Step 1: Rewrite task-engine tests to target behavior instead of adapter shape**

In `tests/integration/flow/flow-engine.test.ts`, replace the in-memory `StorageAdapter` setup with database-backed setup:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createFlowEngine, type FlowContext } from "@/lib/flow";
import { db } from "@/lib/db";
import { taskRuns } from "@/persistence";

async function waitForTask(taskId: string) {
  for (let i = 0; i < 100; i++) {
    const task = await db.query.taskRuns.findFirst({ where: eq(taskRuns.id, taskId) });
    if (task != null && ["completed", "failed", "cancelled"].includes(task.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Task ${taskId} did not reach a terminal state`);
}

describe("Cashier task engine", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("persists submitted input, progress, completion, and token usage", async () => {
    const engine = createFlowEngine({ maxConcurrentTasks: 1 });
    engine.register("behavior_task", {
      async execute(_input: { value: number }, context: FlowContext) {
        await context.updateProgress("halfway");
        context.reportTokens({ model: "test-model", input: 10, output: 5 });
        return { ok: true };
      },
    });

    const taskId = await engine.submit("behavior_task", { value: 2 }, { title: "Behavior Task" });
    const task = await waitForTask(taskId);

    expect(task.status).toBe("completed");
    expect(task.input).toEqual({ value: 2 });
    expect(task.progress).toBeNull();
    expect(task.completedAt).toBeInstanceOf(Date);
    expect(task.tokenUsage).toMatchObject({
      "test-model": { input: 10, output: 5 },
      total: { input: 10, output: 5 },
    });
  });
});
```

Add these concrete behavior tests to `tests/integration/flow/flow-engine.test.ts` after the persistence test:

```typescript
it("records task failures and calls onError", async () => {
  const onError = vi.fn();
  const engine = createFlowEngine({ maxConcurrentTasks: 1 });
  engine.register("failure_task", {
    async execute() {
      throw new Error("planned failure");
    },
    onError,
  });

  const taskId = await engine.submit("failure_task", { value: 1 });
  const task = await waitForTask(taskId);

  expect(task.status).toBe("failed");
  expect(task.error).toBe("planned failure");
  expect(onError).toHaveBeenCalledWith(
    expect.any(Error),
    { value: 1 },
    expect.objectContaining({ taskId })
  );
});

it("deduplicates pending and running tasks by key", async () => {
  const engine = createFlowEngine({ maxConcurrentTasks: 1 });
  engine.register("dedupe_task", {
    async execute() {
      await new Promise((resolve) => setTimeout(resolve, 80));
      return { ok: true };
    },
  });

  const firstTaskId = await engine.submit(
    "dedupe_task",
    { value: 1 },
    { deduplicationKey: "same-key" }
  );
  const secondTaskId = await engine.submit(
    "dedupe_task",
    { value: 2 },
    { deduplicationKey: "same-key" }
  );

  expect(secondTaskId).toBe(firstTaskId);
});

it("calls onCancel for a queued task", async () => {
  const onCancel = vi.fn();
  const engine = createFlowEngine({ maxConcurrentTasks: 1 });
  engine.register("occupy_slot", {
    async execute() {
      await new Promise((resolve) => setTimeout(resolve, 120));
      return { ok: true };
    },
  });
  engine.register("queued_cancel_task", {
    async execute() {
      return { ok: true };
    },
    onCancel,
  });

  await engine.submit("occupy_slot", {});
  const queuedTaskId = await engine.submit("queued_cancel_task", { value: 3 });
  await engine.cancel(queuedTaskId);
  const task = await waitForTask(queuedTaskId);

  expect(task.status).toBe("cancelled");
  expect(onCancel).toHaveBeenCalledWith(
    { value: 3 },
    expect.objectContaining({ taskId: queuedTaskId, signal: expect.any(AbortSignal) })
  );
});

it("calls onComplete after successful execution", async () => {
  const onComplete = vi.fn();
  const engine = createFlowEngine({ maxConcurrentTasks: 1 });
  engine.register("complete_hook_task", {
    async execute() {
      return { result: 42 };
    },
    onComplete,
  });

  const taskId = await engine.submit("complete_hook_task", { value: 21 });
  const task = await waitForTask(taskId);

  expect(task.status).toBe("completed");
  expect(onComplete).toHaveBeenCalledWith(
    { result: 42 },
    { value: 21 },
    expect.objectContaining({ taskId })
  );
});
```

- [ ] **Step 2: Run rewritten flow tests to verify they fail**

Run:

```bash
npx vitest run tests/integration/flow/flow-engine.test.ts tests/integration/flow/deduplication.test.ts tests/integration/flow/on-cancel.test.ts tests/integration/flow/pending-cancel.test.ts
```

Expected: FAIL before implementation because `createFlowEngine` still requires a storage adapter in these tests.

- [ ] **Step 3: Simplify task types**

In `src/lib/flow/types.ts`:

Remove:

```typescript
export interface StorageAdapter { ... }
export interface FlowRuntimeConfig { ... }
export interface FlowRuntime { ... }
```

Keep:

```typescript
export interface FlowEngineConfig {
  maxConcurrentTasks?: number;
  aiContextFactory?: AIContextFactory;
}
```

Keep `TaskInput`, `TaskRecord`, `TaskFilter`, `FlowContext`, `FlowTaskHandler`, `FlowTaskDefinition`, `FlowEngine`, and AI types.

- [ ] **Step 4: Make `engine.ts` persist directly through Drizzle**

In `src/lib/flow/engine.ts`, import persistence directly:

```typescript
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskRuns } from "@/persistence";
```

Add private persistence helpers:

```typescript
async function createTaskRecord(task: TaskInput): Promise<string> {
  const [created] = await db
    .insert(taskRuns)
    .values({
      type: task.type,
      title: task.title ?? task.type,
      input: task.input ?? null,
      deduplicationKey: task.deduplicationKey ?? null,
      scopeId: task.scopeId ?? null,
      entityType: task.entityType ?? null,
      entityId: task.entityId ?? null,
    })
    .returning({ id: taskRuns.id });

  if (created == null) {
    throw new AppError("Failed to create task record", "TASK_CREATE_FAILED");
  }

  return created.id;
}

async function updateTaskRecord(id: string, data: Partial<TaskRecord>): Promise<void> {
  await db
    .update(taskRuns)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(taskRuns.id, id));
}
```

Replace all `config.storage.create/update/get/list` calls with these helpers and direct query helpers.

Keep concurrency, deduplication, cancellation, lifecycle hooks, progress, and token aggregation behavior equivalent.

- [ ] **Step 5: Simplify runtime initialization**

In `src/lib/flow/runtime.ts`, remove `FlowRuntime` and config-object initialization. Keep module-level singleton state:

```typescript
let engine: FlowEngine | null = null;
let initializationPromise: Promise<FlowEngine> | null = null;
```

Make `initializeDefaultFlowRuntime()`:

```typescript
export async function initializeDefaultFlowRuntime(): Promise<FlowEngine> {
  if (engine != null) return engine;
  if (initializationPromise != null) return initializationPromise;

  initializationPromise = (async () => {
    const { getOpenAIClient } = await import("@/lib/ai/openai-client");
    const client = getOpenAIClient();
    const nextEngine = createFlowEngine({
      maxConcurrentTasks: runtimeEnv.maxTaskWorker,
      aiContextFactory: (signal, reportTokens) =>
        createAIContext({
          signal,
          reportTokens,
          getClient: () => client,
          modelConfig: {
            text: runtimeEnv.aiModelText,
            vision: runtimeEnv.aiModelVision,
          },
        }),
    });

    await registerAllTasks(nextEngine);
    engine = nextEngine;
    return nextEngine;
  })();

  try {
    return await initializationPromise;
  } finally {
    initializationPromise = null;
  }
}
```

Update `getFlowEngine`, `submitFlowTask`, `cancelFlowTask`, and `resetFlowRuntime` accordingly.

- [ ] **Step 6: Delete adapter files and update exports**

Delete:

```bash
src/lib/flow/adapters/drizzle-storage.ts
```

In `src/lib/flow/index.ts`, remove exports for deleted config/adapter/runtime types. Export only active task engine APIs and types.

- [ ] **Step 7: Run focused task verification**

Run:

```bash
npx vitest run tests/unit/lib/flow/ai-context.test.ts tests/unit/lib/flow/json-utils.test.ts tests/unit/lib/flow/runtime.test.ts tests/unit/lib/flow/task-registry.test.ts
npx vitest run tests/integration/flow tests/integration/processing-tasks.test.ts tests/integration/modules/source-document/application/tasks/parse-source-document.test.ts
npm run tsc
```

Expected: PASS. If cancellation tests are flaky, make the test handler wait on an explicit promise instead of fixed sleep.

- [ ] **Step 8: Commit**

```bash
git add src/lib/flow tests/unit/lib/flow tests/integration/flow tests/integration/processing-tasks.test.ts tests/integration/modules/source-document/application/tasks/parse-source-document.test.ts
git add -u src/lib/flow/adapters
git commit -m "refactor: specialize flow engine for cashier"
```

---

### Task 4: Flatten Domain Entry Points

**Files:**
- Modify: `src/modules/source-document/application/queries/list-source-document-page.ts`
- Modify: `src/modules/source-document/application/queries/list-source-document-collection.ts`
- Modify: `src/modules/source-document/application/queries/source-document-queries.ts`
- Delete: `src/modules/source-document/queries.ts`
- Modify: `src/modules/source-document/server-actions/queries.ts`
- Modify: `src/app/api/v1/source-documents/route.ts`
- Delete: `src/modules/ledger/queries.ts`
- Delete: `src/modules/ledger/use-cases.ts`
- Modify: `src/modules/ledger/server-actions/categories.ts`
- Modify: `src/modules/ledger/server-actions/categorize.ts`
- Modify: `src/modules/ledger/server-actions/create.ts`
- Modify: `src/modules/ledger/server-actions/credentials.ts`
- Modify: `src/modules/ledger/server-actions/delete.ts`
- Modify: `src/modules/ledger/server-actions/entries.ts`
- Modify: `src/modules/ledger/server-actions/export.ts`
- Modify: `src/modules/ledger/server-actions/get.ts`
- Modify: `src/modules/ledger/server-actions/get-entry.ts`
- Modify: `src/modules/ledger/server-actions/settings.ts`
- Modify: `src/modules/ledger/server-actions/stats.ts`
- Modify: `src/modules/ledger/server-actions/update.ts`
- Modify: `src/modules/workspace/application/use-cases/ensure-user-ledger.ts`
- Modify: `src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts`
- Modify: `src/app/api/v1/categories/route.ts`
- Modify: `src/app/api/v1/entries/route.ts`
- Modify: `src/app/api/v1/stats/route.ts`
- Modify: `tests/unit/workspace/ensure-user-ledger.test.ts`
- Modify: `tests/unit/workspace/get-ledger-page-bootstrap.test.ts`
- Modify: `tests/unit/ledger/server-actions/get-entry.test.ts`
- Modify: `tests/unit/ledger/server-actions-omission.test.ts`
- Modify: `tests/unit/modules/ledger/server-actions/validation.test.ts`
- Modify: `tests/unit/api/v1/ledger-query-routes-omission.test.ts`
- Modify: `tests/unit/api/v1/public-contract-routes.test.ts`
- Modify: `tests/unit/api/v1/source-documents-route-omission.test.ts`
- Modify: `tests/integration/api/entry-categories.test.ts`
- Modify: `tests/integration/api/ledger-entries.test.ts`
- Modify: `tests/integration/api/processing-stats.test.ts`
- Modify: `tests/integration/api/source-documents-route.test.ts`
- Modify: `tests/integration/api/v1-query-endpoints.test.ts`
- Modify: `tests/integration/ledger-search.test.ts`
- Modify: `tests/integration/ledger/ledger-single-owner-race-and-rollback.test.ts`

- [ ] **Step 1: Extend governance test for backend barrel removal**

Add to `tests/unit/architecture/backend-simplification.test.ts`:

```typescript
it("does not use backend query/use-case barrels from production source", () => {
  const forbiddenImports = [
    "@/modules/source-document/queries",
    "@/modules/ledger/queries",
    "@/modules/ledger/use-cases",
  ];
  const allowedFiles = new Set([
    "src/modules/source-document/actions.ts",
    "src/modules/ledger/actions.ts",
  ]);
  const offenders: string[] = [];

  for (const file of collectSourceFiles(path.resolve(repoRoot, "src"))) {
    const relative = path.relative(repoRoot, file);
    if (allowedFiles.has(relative)) continue;
    const source = readFileSync(file, "utf8");
    for (const forbiddenImport of forbiddenImports) {
      if (source.includes(forbiddenImport)) {
        offenders.push(`${relative} imports ${forbiddenImport}`);
      }
    }
  }

  expect(offenders).toEqual([]);
});
```

- [ ] **Step 2: Run governance test to verify it fails**

Run:

```bash
npx vitest run tests/unit/architecture/backend-simplification.test.ts
```

Expected: FAIL because production source still imports ledger/source-document query and use-case barrels.

- [ ] **Step 3: Collapse source-document query entry points**

Keep one validated public domain function per query shape:

In `src/modules/source-document/application/queries/list-source-document-page.ts`, keep:

```typescript
export async function listSourceDocuments(
  ledgerId: string,
  params: ListSourceDocumentsInput
): Promise<SourceDocumentPageDto> {
  const validated = parseListSourceDocumentsInput(params);
  return listSourceDocumentsQuery(ledgerId, {
    status: validated.status ?? null,
    startDate: validated.startDate ?? null,
    endDate: validated.endDate ?? null,
    cursor: validated.cursor ?? null,
    limit: validated.limit,
    includeLedgerEntries: validated.includeEntries,
  });
}
```

Remove `listSourceDocumentsFromValidatedInput` unless a production caller still requires it after server action updates.

In `src/modules/source-document/application/queries/list-source-document-collection.ts`, keep:

```typescript
export async function getSourceDocumentCollection(
  ledgerId: string,
  params: ListSourceDocumentCollectionInput
): Promise<SourceDocumentCollectionDto> {
  const parsed = sourceDocumentCollectionInputSchema.safeParse(params);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", { issues: parsed.error.issues });
  }

  const result = await listSourceDocumentCollectionQuery(ledgerId, {
    startDate: parsed.data.startDate ?? null,
    endDate: parsed.data.endDate ?? null,
    ...(parsed.data.minAmount !== undefined ? { minAmount: parsed.data.minAmount } : {}),
    ...(parsed.data.maxAmount !== undefined ? { maxAmount: parsed.data.maxAmount } : {}),
    ...(parsed.data.search !== undefined ? { search: parsed.data.search } : {}),
    limit: parsed.data.limit,
  });

  if (result.hasMore) {
    logger.warn({ ledgerId, limit: parsed.data.limit }, "source document collection hit limit");
  }

  return result;
}
```

Update `src/modules/source-document/server-actions/queries.ts` to call these domain functions directly after `withLedgerAccess`, without duplicating validation.

- [ ] **Step 4: Update API v1 source-document route imports**

In `src/app/api/v1/source-documents/route.ts`, replace the `listSourceDocuments` import from `@/modules/source-document/actions` with:

```typescript
import { listSourceDocuments } from "@/modules/source-document/application/queries/list-source-document-page";
```

Keep `createSourceDocumentFromCredentialAction` import from actions because the POST path still needs the credential-specific action boundary.

- [ ] **Step 5: Flatten ledger imports in server actions and API routes**

Replace imports from `@/modules/ledger/use-cases` in server-action files with direct imports, for example:

```typescript
import { createLedger } from "@/modules/ledger/application/use-cases/create-ledger";
import { updateLedger } from "@/modules/ledger/application/use-cases/update-ledger";
import { batchUpdateLedgerEntries } from "@/modules/ledger/application/use-cases/mutate-ledger-entries";
```

Replace imports from `@/modules/ledger/queries` in API routes with concrete query imports:

```typescript
import { listLedgerEntries } from "@/modules/ledger/application/queries/list-ledger-entries";
import { calculateLedgerStats } from "@/modules/ledger/application/queries/calculate-ledger-stats";
import { listEntryCategories } from "@/modules/ledger/application/queries/list-entry-categories";
```

Update `src/modules/workspace/application/use-cases/ensure-user-ledger.ts` to import `createDefaultLedger` from `@/modules/ledger/application/use-cases/create-default-ledger`.

Update `src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts` to import ledger queries from `src/modules/ledger/application/queries/*` and source-document collection queries from `src/modules/source-document/application/queries/list-source-document-collection`.

Keep `src/modules/ledger/actions.ts` as the top-level Server Action export used by UI callers.

- [ ] **Step 6: Delete backend-only barrels**

Delete these backend-only barrel files:

```bash
rm src/modules/source-document/queries.ts
rm src/modules/ledger/queries.ts
rm src/modules/ledger/use-cases.ts
```

If TypeScript reveals a UI or public caller still depends on one of these deleted exports, move only that needed export to the owning `actions.ts` file or concrete domain file, update the caller to import from that owner, then keep the barrel deleted.

- [ ] **Step 7: Run focused query/action verification**

Run:

```bash
npx vitest run tests/unit/architecture/backend-simplification.test.ts
npx vitest run tests/unit/api/v1/ledger-query-routes-omission.test.ts tests/unit/api/v1/public-contract-routes.test.ts tests/unit/api/v1/source-documents-route-omission.test.ts tests/unit/ledger/server-actions-omission.test.ts tests/unit/ledger/server-actions/get-entry.test.ts tests/unit/modules/ledger/server-actions/validation.test.ts tests/unit/workspace/ensure-user-ledger.test.ts tests/unit/workspace/get-ledger-page-bootstrap.test.ts
npx vitest run tests/unit/modules/source-document/application/queries/can-access-source-document-upload.test.ts tests/unit/modules/source-document/application/queries/focused-source-document-queries.test.ts tests/unit/modules/source-document/application/queries/get-pending-source-documents.test.ts tests/unit/modules/source-document/application/queries/get-source-document-detail.test.ts tests/unit/modules/source-document/application/queries/get-source-document-light.test.ts tests/unit/modules/source-document/application/queries/source-document-processing.test.ts tests/unit/modules/source-document/application/queries/source-document-query-cursor.test.ts tests/integration/modules/source-document/application/queries/source-document-queries.test.ts
npx vitest run tests/integration/api/v1-query-endpoints.test.ts tests/integration/api/source-documents-route.test.ts tests/integration/api/ledger-entries.test.ts tests/integration/api/entry-categories.test.ts tests/integration/api/processing-stats.test.ts tests/integration/ledger-search.test.ts tests/integration/ledger/ledger-single-owner-race-and-rollback.test.ts
npm run tsc
```

Expected: PASS. If tests only assert old barrel paths, rewrite them to import concrete domain functions or public Server Actions.

- [ ] **Step 8: Commit**

```bash
git add src/modules src/app/api tests/unit/architecture tests/unit/api tests/unit/ledger tests/unit/modules/ledger tests/unit/modules/source-document tests/unit/workspace tests/integration/modules/source-document tests/integration/api tests/integration/ledger-search.test.ts tests/integration/ledger
git add -u src/modules/source-document/queries.ts src/modules/ledger/queries.ts src/modules/ledger/use-cases.ts
git commit -m "refactor: flatten backend domain entry points"
```

---

### Task 5: Move Exchange-Rate Orchestration To Explicit Bootstrap

**Files:**
- Modify: `tests/unit/architecture/backend-simplification.test.ts`
- Modify: `src/instrumentation.ts`
- Modify: `src/lib/orchestration/exchange-rate-ledger-recalculation.ts`
- Modify: `src/modules/source-document/application/use-cases/create-quick-entry.ts`
- Modify: `src/modules/source-document/application/parse-source-document/entry-builder.ts`
- Modify: `src/modules/ledger/application/use-cases/mutate-ledger-entries.ts`
- Modify: `src/modules/ledger/application/services/recalculate-entries-converted-amount.ts`
- Modify: `tests/unit/instrumentation.test.ts`
- Modify: `tests/integration/exchange-rate-ledger-recalculation.test.ts`

- [ ] **Step 1: Add failing governance test for import-time orchestration**

Add to `tests/unit/architecture/backend-simplification.test.ts`:

```typescript
it("initializes exchange-rate orchestration only from bootstrap code", () => {
  const allowedFiles = new Set([
    "src/instrumentation.ts",
    "src/lib/orchestration/exchange-rate-ledger-recalculation.ts",
  ]);
  const offenders: string[] = [];

  for (const file of collectSourceFiles(path.resolve(repoRoot, "src"))) {
    const relative = path.relative(repoRoot, file);
    if (allowedFiles.has(relative)) continue;
    const source = readFileSync(file, "utf8");
    if (source.includes("initializeExchangeRateLedgerRecalculationOrchestration")) {
      offenders.push(relative);
    }
  }

  expect(offenders).toEqual([]);
});
```

- [ ] **Step 2: Run governance test to verify it fails**

Run:

```bash
npx vitest run tests/unit/architecture/backend-simplification.test.ts
```

Expected: FAIL because multiple use-case/service files import and call `initializeExchangeRateLedgerRecalculationOrchestration`.

- [ ] **Step 3: Move initialization into `instrumentation.ts`**

In `src/instrumentation.ts`, after `initializeDefaultFlowRuntime()` succeeds, add:

```typescript
const { initializeExchangeRateLedgerRecalculationOrchestration } = await import(
  "@/lib/orchestration/exchange-rate-ledger-recalculation"
);
initializeExchangeRateLedgerRecalculationOrchestration();
```

Keep startup order:

```typescript
const { initializeDefaultFlowRuntime } = await import("@/lib/flow/runtime");
await initializeDefaultFlowRuntime();

const { initializeExchangeRateLedgerRecalculationOrchestration } = await import(
  "@/lib/orchestration/exchange-rate-ledger-recalculation"
);
initializeExchangeRateLedgerRecalculationOrchestration();
```

- [ ] **Step 4: Remove top-level orchestration side effects from business modules**

Remove both the import and top-level call from:

```bash
src/modules/source-document/application/use-cases/create-quick-entry.ts
src/modules/source-document/application/parse-source-document/entry-builder.ts
src/modules/ledger/application/use-cases/mutate-ledger-entries.ts
src/modules/ledger/application/services/recalculate-entries-converted-amount.ts
```

Do not remove direct calls to `recalculateEntriesConvertedAmount` that are part of explicit business behavior.

- [ ] **Step 5: Update instrumentation test**

In `tests/unit/instrumentation.test.ts`, mock the orchestration module:

```typescript
const initializeExchangeRateLedgerRecalculationOrchestration = vi.fn();

vi.mock("@/lib/orchestration/exchange-rate-ledger-recalculation", () => ({
  initializeExchangeRateLedgerRecalculationOrchestration,
}));
```

Assert startup order:

```typescript
expect(initializeDefaultFlowRuntime).toHaveBeenCalledTimes(1);
expect(initializeExchangeRateLedgerRecalculationOrchestration).toHaveBeenCalledTimes(1);
const flowOrder = initializeDefaultFlowRuntime.mock.invocationCallOrder.at(0);
const orchestrationOrder =
  initializeExchangeRateLedgerRecalculationOrchestration.mock.invocationCallOrder.at(0);
expect(flowOrder).toBeLessThan(orchestrationOrder);
```

- [ ] **Step 6: Run focused orchestration verification**

Run:

```bash
npx vitest run tests/unit/architecture/backend-simplification.test.ts tests/unit/instrumentation.test.ts tests/integration/exchange-rate-ledger-recalculation.test.ts
npm run tsc
```

Expected: PASS. The exchange-rate integration test should still show one handler registration and recalculation after stored rates.

- [ ] **Step 7: Commit**

```bash
git add src/instrumentation.ts src/lib/orchestration src/modules/source-document/application/use-cases/create-quick-entry.ts src/modules/source-document/application/parse-source-document/entry-builder.ts src/modules/ledger/application/use-cases/mutate-ledger-entries.ts src/modules/ledger/application/services/recalculate-entries-converted-amount.ts tests/unit/architecture tests/unit/instrumentation.test.ts tests/integration/exchange-rate-ledger-recalculation.test.ts
git commit -m "refactor: bootstrap exchange rate orchestration explicitly"
```

---

### Task 6: Full Verification And Cleanup

**Files:**
- Inspect: `src/app/api/`
- Inspect: `src/modules/`
- Inspect: `src/lib/`
- Inspect: `src/persistence/`
- Inspect: `tests/`
- No planned edits beyond files listed in Tasks 1-5. If Step 1 reports a stale import, add that exact file path to the relevant earlier task before changing it.

- [ ] **Step 1: Scan for deleted imports and obsolete files**

Run:

```bash
rg -n "@/lib/serialization|@/lib/ai/dual-gpt-runner|@/lib/storage/memory|@/modules/source-document/queries|@/modules/ledger/queries|@/modules/ledger/use-cases|StorageAdapter|createDrizzleStorage|loadFlowRuntimeEnvConfig" src tests
```

Expected: no matches. If a UI caller still needs a stable public export, expose it from the owning `src/modules/<module>/actions.ts` file and update the caller to import from that explicit public boundary.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run lint
npm run tsc
npm run test:unit
npm run test:integration
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 3: Inspect git diff for accidental behavior changes**

Run:

```bash
git diff -- src/app/api src/modules src/lib src/persistence tests
```

Check that:

- Files in `src/persistence/schema/` keep existing table and column semantics.
- API v1 route URLs and methods are unchanged.
- Server Action exports used by UI still exist through `src/modules/ledger/actions.ts` and `src/modules/source-document/actions.ts`.
- Auth and ledger access helpers remain.
- Task type strings remain unchanged.
- Parse pipeline output handling remains unchanged.

- [ ] **Step 4: Commit final cleanup**

```bash
git add src tests docs
git commit -m "refactor: complete backend simplification"
```

- [ ] **Step 5: Summarize implementation evidence**

Report:

- Deleted modules and reduced entry points.
- Preserved public contracts.
- Verification commands and pass/fail output.
- Any intentionally retained abstraction and why it remains.
