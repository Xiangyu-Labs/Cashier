# Independent Backend Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggressively simplify Cashier backend internals by deleting optional compatibility layers, moving the task runtime out of `flow`, making env configuration single-source, and flattening duplicate backend entrypoints while preserving behavior.

**Architecture:** Keep hard boundaries for security, tenant isolation, API v1, DTO mapping, persistence, and source-document parsing. Be aggressive only inside implementation structure: delete optional backend barrels, migrate `src/lib/flow` to `src/lib/tasks`, remove `Flow*` compatibility names, delete env catalog/default splits, and add governance tests so these layers do not return.

**Tech Stack:** Next.js App Router, TypeScript, Server Actions, Drizzle ORM, SQLite, Zod, NextAuth, OpenAI SDK, TanStack Query, Vitest.

---

## Source Spec

Implement [2026-07-07-backend-simplification-independent-design.md](/Users/xiangyu/Projects/Cashier/docs/superpowers/specs/2026-07-07-backend-simplification-independent-design.md).

This plan intentionally ignores earlier backend simplification plans. It implements the spec's recommended **Alternative D: Strong internal simplification**.

## File Structure

- Modify: `docs/architecture/coding-patterns.md`  
  Update backend import policy to permit direct concrete application imports in server-only code and discourage pass-through barrels.
- Modify: `tests/unit/architecture/backend-simplification.test.ts`  
  Add governance tests for deleted env files, deleted source-document query barrel, deleted optional backend barrels, moved task runtime, no `Flow*` production names, API v1 route helper usage, and UI action boundaries.
- Modify: `src/lib/env/startup.ts`  
  Own defaults, Zod schema, validation, and single-key parsing.
- Modify: `src/lib/env/runtime.ts`  
  Keep live typed getters backed by `startup.ts`.
- Modify: `src/lib/env/public.ts`  
  Read `NEXT_PUBLIC_*` values without importing runtime getters.
- Delete: `src/lib/env/defaults.ts`
- Delete: `src/lib/env/catalog.ts`
- Delete: `tests/unit/lib/env/catalog.test.ts`
- Modify: `tests/unit/lib/env/public-source.test.ts`
- Modify: `tests/unit/lib/env/runtime.test.ts`
- Modify: `tests/unit/lib/env/startup.test.ts`
- Create: `src/lib/tasks/` from current `src/lib/flow/`
- Delete: `src/lib/flow/`
- Modify: `src/lib/tasks/types.ts`, `src/lib/tasks/runtime.ts`, `src/lib/tasks/engine.ts`, `src/lib/tasks/task-registry.ts`, `src/lib/tasks/index.ts`  
  Rename `Flow*` APIs to task runtime APIs.
- Modify: task callers in `src/instrumentation.ts`, `src/modules/ledger`, `src/modules/source-document`, `src/modules/task-queue`, and tests.
- Create: `tests/integration/tasks/` from current `tests/integration/flow/`
- Create: `tests/unit/lib/tasks/` from current `tests/unit/lib/flow/`
- Delete: `tests/integration/flow/`
- Delete: `tests/unit/lib/flow/`
- Delete: `src/modules/source-document/application/queries/source-document-queries.ts`
- Modify: `src/modules/source-document/application/queries/list-source-document-page.ts`
- Modify: `src/modules/source-document/application/queries/list-source-document-collection.ts`
- Modify: `src/modules/source-document/server-actions/queries.ts`
- Modify: `src/app/api/v1/source-documents/route.ts`
- Delete optional backend barrels unless a task proves a real public caller category:
  - `src/modules/auth/use-cases.ts`
  - `src/modules/auth/queries.ts`
  - `src/modules/currency/use-cases.ts`
  - `src/modules/stats/queries.ts`
  - `src/modules/workspace/use-cases.ts`
  - `src/modules/workspace/queries.ts`
- Modify affected imports in `src/auth.ts`, protected app pages, API v1 routes, auth server actions, workspace code, source-document parsing, ledger currency mutation code, and tests.

## Task 1: Lock The Strong Simplification Target

**Files:**
- Modify: `docs/architecture/coding-patterns.md`
- Modify: `tests/unit/architecture/backend-simplification.test.ts`

- [ ] **Step 1: Add governance tests that fail against the current code**

Append these tests inside the existing `describe("backend simplification governance", () => { ... })` block in `tests/unit/architecture/backend-simplification.test.ts`:

```typescript
  it("keeps env runtime sources single-owner", () => {
    const removedPaths = [
      "src/lib/env/defaults.ts",
      "src/lib/env/catalog.ts",
      "tests/unit/lib/env/catalog.test.ts",
    ];

    for (const relativePath of removedPaths) {
      expect(existsSync(path.resolve(repoRoot, relativePath)), relativePath).toBe(false);
    }

    const startupSource = readFileSync(path.resolve(repoRoot, "src/lib/env/startup.ts"), "utf8");
    expect(startupSource).toContain("export const ENV_DEFAULTS");
  });

  it("moves task runtime out of flow and removes Flow compatibility names", () => {
    expect(existsSync(path.resolve(repoRoot, "src/lib/flow"))).toBe(false);
    expect(existsSync(path.resolve(repoRoot, "src/lib/tasks"))).toBe(true);
    expect(existsSync(path.resolve(repoRoot, "tests/integration/flow"))).toBe(false);
    expect(existsSync(path.resolve(repoRoot, "tests/unit/lib/flow"))).toBe(false);
    expect(existsSync(path.resolve(repoRoot, "tests/integration/tasks"))).toBe(true);
    expect(existsSync(path.resolve(repoRoot, "tests/unit/lib/tasks"))).toBe(true);

    const forbiddenTerms = [
      "FlowEngine",
      "FlowEngineConfig",
      "FlowContext",
      "FlowTaskHandler",
      "FlowTaskDefinition",
      "FlowTaskMetadata",
      "createFlowEngine",
      "initializeDefaultFlowRuntime",
      "getFlowEngine",
      "submitFlowTask",
      "cancelFlowTask",
      "resetFlowRuntime",
      "@/lib/flow",
    ];
    const offenders: string[] = [];

    for (const file of collectSourceFiles(path.resolve(repoRoot, "src"))) {
      const relative = path.relative(repoRoot, file);
      const source = readFileSync(file, "utf8");
      for (const term of forbiddenTerms) {
        if (source.includes(term)) {
          offenders.push(`${relative} contains ${term}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("deletes optional backend barrels that only add indirection", () => {
    const removedPaths = [
      "src/modules/auth/use-cases.ts",
      "src/modules/auth/queries.ts",
      "src/modules/currency/use-cases.ts",
      "src/modules/stats/queries.ts",
      "src/modules/workspace/use-cases.ts",
      "src/modules/workspace/queries.ts",
      "src/modules/source-document/application/queries/source-document-queries.ts",
    ];

    for (const relativePath of removedPaths) {
      expect(existsSync(path.resolve(repoRoot, relativePath)), relativePath).toBe(false);
    }
  });

  it("keeps API v1 routes on the shared route helper", () => {
    const apiDir = path.resolve(repoRoot, "src/app/api/v1");
    const routeFiles = collectSourceFiles(apiDir).filter((file) => file.endsWith("/route.ts"));
    const offenders = routeFiles
      .map((file) => {
        const relative = path.relative(repoRoot, file);
        const source = readFileSync(file, "utf8");
        return source.includes("handleApiV1Route") ? null : relative;
      })
      .filter((value): value is string => value != null);

    expect(offenders).toEqual([]);
  });

  it("keeps UI code on module action entrypoints instead of deep server-action imports", () => {
    const offenders: string[] = [];

    for (const file of collectSourceFiles(path.resolve(repoRoot, "src"))) {
      const relative = path.relative(repoRoot, file);
      if (!relative.includes("/ui/") && !relative.includes("/hooks/")) continue;

      const source = readFileSync(file, "utf8");
      if (source.includes("/server-actions/")) {
        offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });
```

- [ ] **Step 2: Run the governance test and verify red**

Run:

```bash
npx vitest run tests/unit/architecture/backend-simplification.test.ts
```

Expected: FAIL because `src/lib/flow`, env split files, source-document query barrel, and optional backend barrels still exist.

- [ ] **Step 3: Update durable architecture policy**

In `docs/architecture/coding-patterns.md`, replace section `## 1. 模块边界` with:

```markdown
## 1. 模块边界

- `application/` 是业务实现层；`server-actions/` 是登录态鉴权与输入校验边界；依赖方向只能是 `server-actions -> application`
- UI 组件、客户端 hooks、route component 通过 `src/modules/{domain}/actions.ts` 调用 Server Actions，通过 `contracts.ts` 使用 DTO 类型
- API v1 route handlers 必须复用 `src/app/api/v1/_shared/route-helper.ts`；它们可以直接调用具体 `application/queries/*` 或 `application/use-cases/*` 函数，因为鉴权来源是 service credential 而不是 session
- 服务端组合模块可以直接调用具体 application 函数；不要为了满足跨模块调用而新增只转发的 `queries.ts` 或 `use-cases.ts` barrel
- `actions.ts` 和 `contracts.ts` 是稳定公共入口；`tasks.ts` 只在集中注册任务时隐藏任务文件布局；不要新增无真实边界价值的 backend barrel
- 输入 contract 归 `contract-schemas.ts` 所有；边界校验放在 schema 和 server action，不把重复校验散落到调用方
```

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/coding-patterns.md tests/unit/architecture/backend-simplification.test.ts
git commit -m "test: lock strong backend simplification target"
```

## Task 2: Consolidate Env And Delete Catalog

**Files:**
- Modify: `src/lib/env/startup.ts`
- Modify: `src/lib/env/runtime.ts`
- Modify: `src/lib/env/public.ts`
- Delete: `src/lib/env/defaults.ts`
- Delete: `src/lib/env/catalog.ts`
- Delete: `tests/unit/lib/env/catalog.test.ts`
- Modify: `tests/unit/lib/env/public-source.test.ts`
- Modify: `tests/unit/lib/env/runtime.test.ts`
- Modify: `tests/unit/lib/env/startup.test.ts`
- Modify: `tests/unit/architecture/backend-simplification.test.ts`

- [ ] **Step 1: Move defaults into `startup.ts`**

In `src/lib/env/startup.ts`, delete:

```typescript
import { ENV_DEFAULTS } from "./defaults";
export { ENV_DEFAULTS } from "./defaults";
```

Add this constant after the imports:

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
  AUTH_EMAIL_FROM: "Cashier <noreply@example.com>",
  MAX_TASK_WORKER: "10",
  EXPORT_MAX_ENTRIES: "2000",
  MAX_INPUT_PIXELS: "25000000",
  MAX_IMAGE_QUALITY: "85",
  LOG_LEVEL: "info",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
} as const;
```

- [ ] **Step 2: Update `public.ts` to import startup defaults**

In `src/lib/env/public.ts`, replace:

```typescript
import { ENV_DEFAULTS } from "./defaults";
```

with:

```typescript
import { ENV_DEFAULTS } from "./startup";
```

- [ ] **Step 3: Delete catalog and defaults files**

Run:

```bash
rm src/lib/env/defaults.ts
rm src/lib/env/catalog.ts
rm tests/unit/lib/env/catalog.test.ts
```

- [ ] **Step 4: Replace the public-source test**

Replace `tests/unit/lib/env/public-source.test.ts` with:

```typescript
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("public env source", () => {
  it("uses startup defaults without importing runtime env", () => {
    const source = readFileSync(path.resolve(process.cwd(), "src/lib/env/public.ts"), "utf8");

    expect(source).toContain('import { ENV_DEFAULTS } from "./startup"');
    expect(source).toContain("process.env.NEXT_PUBLIC_APP_URL");
    expect(source).not.toContain("runtimeEnv");
    expect(source).not.toContain("./defaults");
  });
});
```

- [ ] **Step 5: Add startup test coverage for all env keys**

In `tests/unit/lib/env/startup.test.ts`, add:

```typescript
  it("owns all app env defaults in the startup module", () => {
    expect(Object.keys(ENV_DEFAULTS).sort()).toEqual([
      "AI_MAX_RETRIES",
      "AI_MODEL_TEXT",
      "AI_MODEL_VISION",
      "AI_RETRY_DELAY_MS",
      "AI_TEMPERATURE",
      "API_RATE_LIMIT_PER_MINUTE",
      "AUTH_EMAIL_FROM",
      "AUTH_RATE_LIMIT_MAX",
      "AUTH_RATE_LIMIT_WINDOW",
      "AUTH_URL",
      "CURRENCY_STALE_TIME_MS",
      "DATABASE_URL",
      "DISABLE_REGISTRATION",
      "EXPORT_MAX_ENTRIES",
      "LOCAL_STORAGE_PATH",
      "LOG_LEVEL",
      "MAX_IMAGE_QUALITY",
      "MAX_INPUT_PIXELS",
      "MAX_TASK_WORKER",
      "NEXT_PUBLIC_APP_URL",
      "OPENAI_BASE_URL",
      "OTP_EXPIRES_SECONDS",
      "OTP_IP_MAX_ATTEMPTS_PER_HOUR",
      "OTP_LOCKOUT_MINUTES",
      "OTP_MAX_ATTEMPTS",
      "OTP_RESEND_COOLDOWN_SECONDS",
      "OTP_VERIFY_MAX_ATTEMPTS_PER_MINUTE",
      "SESSION_MAX_AGE_DAYS",
      "SOURCE_DOC_STALE_TIME_MS",
      "TZ",
    ]);
  });
```

- [ ] **Step 6: Run focused env tests**

Run:

```bash
npx vitest run tests/unit/lib/env/startup.test.ts tests/unit/lib/env/runtime.test.ts tests/unit/lib/env/public-source.test.ts tests/unit/architecture/backend-simplification.test.ts
```

Expected: env tests PASS. Governance FAILS only on the Task 3, Task 4, and Task 5 target-shape checks that intentionally remain incomplete.

- [ ] **Step 7: Run typecheck**

Run:

```bash
npm run tsc
```

Expected: PASS. If TypeScript reports `@/lib/env/catalog` or `@/lib/env/defaults`, replace the import with `@/lib/env/startup` or delete the catalog usage.

- [ ] **Step 8: Commit**

```bash
git add src/lib/env/startup.ts src/lib/env/runtime.ts src/lib/env/public.ts tests/unit/lib/env/startup.test.ts tests/unit/lib/env/runtime.test.ts tests/unit/lib/env/public-source.test.ts tests/unit/architecture/backend-simplification.test.ts
git add -u src/lib/env/defaults.ts src/lib/env/catalog.ts tests/unit/lib/env/catalog.test.ts
git commit -m "refactor: make env schema the single runtime source"
```

## Task 3: Move Task Runtime From `flow` To `tasks`

**Files:**
- Create: `src/lib/tasks/*`
- Delete: `src/lib/flow/*`
- Create: `tests/integration/tasks/*`
- Delete: `tests/integration/flow/*`
- Create: `tests/unit/lib/tasks/*`
- Delete: `tests/unit/lib/flow/*`
- Modify: `src/instrumentation.ts`
- Modify: production task callers under `src/modules/ledger`, `src/modules/source-document`, `src/modules/task-queue`
- Modify: `tests/unit/architecture/backend-simplification.test.ts`

- [ ] **Step 1: Move the directory**

Run:

```bash
mkdir -p src/lib/tasks
mv src/lib/flow/* src/lib/tasks/
rmdir src/lib/flow
mkdir -p tests/integration/tasks tests/unit/lib/tasks
mv tests/integration/flow/* tests/integration/tasks/
mv tests/unit/lib/flow/* tests/unit/lib/tasks/
rmdir tests/integration/flow tests/unit/lib/flow
mv tests/integration/tasks/flow-engine.test.ts tests/integration/tasks/task-runtime.test.ts
mv tests/integration/tasks/basic-flow.test.ts tests/integration/tasks/basic-task-runtime.test.ts
```

This task deliberately migrates test paths together with production paths so the old `flow` concept is gone from both source and task-runtime tests.

- [ ] **Step 2: Rename task runtime types**

In `src/lib/tasks/types.ts`, rename these declarations:

```text
FlowEngineConfig -> TaskRuntimeConfig
FlowContext -> TaskContext
FlowTaskHandler -> TaskHandler
FlowTaskDefinition -> TaskDefinition
FlowEngine -> TaskRuntime
FlowTaskMetadata -> TaskMetadata
```

The resulting task runtime declarations must be:

```typescript
export interface TaskRuntimeConfig {
  maxConcurrentTasks?: number;
  aiContextFactory?: AIContextFactory;
}

export interface TaskContext {
  taskId: string;
  signal: AbortSignal;
  reportTokens(usage: TokenUsage): void;
  updateProgress(message: string): Promise<void>;
  ai: AIContext;
}

export interface TaskHandler<TInput, TOutput> {
  execute(input: TInput, context: TaskContext): Promise<TOutput>;
  onComplete?(output: TOutput, input: TInput, context: TaskContext): Promise<void>;
  onError?(error: Error, input: TInput, context: TaskContext): Promise<void>;
  onCancel?(input: TInput, context: TaskContext): Promise<void>;
}

export interface TaskDefinition<TInput, TOutput> {
  type: string;
  handler: TaskHandler<TInput, TOutput>;
}

export interface TaskRuntime {
  register<TInput, TOutput>(name: string, handler: TaskHandler<TInput, TOutput>): void;
  submit<TInput>(name: string, input: TInput, meta?: TaskMetadata): Promise<string>;
  cancel(taskId: string): Promise<void>;
  getStatus(taskId: string): Promise<TaskRecord | null>;
  listTasks(filter?: TaskFilter): Promise<TaskRecord[]>;
  getRunningTasks(): Promise<TaskRecord[]>;
  getMetrics(): Promise<TaskMetrics>;
}

export interface TaskMetadata {
  title?: string;
  scopeId?: string;
  entityType?: string;
  entityId?: string;
  deduplicationKey?: string;
}
```

Do not add `Flow*` aliases.

- [ ] **Step 3: Rename engine factory**

In `src/lib/tasks/engine.ts`, replace the old import names with:

```typescript
import type {
  AIContext,
  TaskContext,
  TaskRuntime,
  TaskRuntimeConfig,
  TaskHandler,
  TaskFilter,
  TaskInput,
  TaskRecord,
  TaskStatus,
  TokenUsage,
  TokenUsageRecord,
  TaskMetrics,
} from "./types";
```

Change the factory signature to:

```typescript
export function createTaskRuntime(config: TaskRuntimeConfig): TaskRuntime {
```

Replace local `FlowContext` with `TaskContext` and `FlowTaskHandler` with `TaskHandler`. Do not export `createFlowEngine`.

- [ ] **Step 4: Rename runtime API**

Replace `src/lib/tasks/runtime.ts` with task-centric names:

```typescript
import { createAIContext } from "./ai-context";
import { createTaskRuntime } from "./engine";
import { registerAllTasks, resetTaskRegistry } from "./task-registry";
import { AppError } from "@/lib/errors";
import { runtimeEnv } from "@/lib/env/runtime";
import type { TaskRuntime, TaskMetadata } from "./types";

let runtime: TaskRuntime | null = null;
let initializationPromise: Promise<TaskRuntime> | null = null;

async function ensureTaskRuntime(): Promise<TaskRuntime> {
  if (runtime != null) {
    return runtime;
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    throw new AppError(
      "Task runtime is not supported in the Edge Runtime.",
      "TASK_RUNTIME_EDGE_UNSUPPORTED"
    );
  }

  return initializeDefaultTaskRuntime();
}

export async function initializeDefaultTaskRuntime(): Promise<TaskRuntime> {
  if (runtime != null) {
    return runtime;
  }

  if (initializationPromise != null) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const { getOpenAIClient } = await import("@/lib/ai/openai-client");

    const nextRuntime = createTaskRuntime({
      maxConcurrentTasks: runtimeEnv.maxTaskWorker,
      aiContextFactory: (signal, reportTokens) =>
        createAIContext({
          signal,
          reportTokens,
          getClient: getOpenAIClient,
          modelConfig: {
            text: runtimeEnv.aiModelText,
            vision: runtimeEnv.aiModelVision,
          },
        }),
    });

    await registerAllTasks(nextRuntime);
    runtime = nextRuntime;
    return nextRuntime;
  })();

  try {
    return await initializationPromise;
  } catch (error) {
    resetTaskRegistry();
    throw error;
  } finally {
    initializationPromise = null;
  }
}

export function getTaskRuntime(): TaskRuntime {
  if (runtime == null) {
    throw new AppError(
      "Task runtime has not been initialized. Call initializeDefaultTaskRuntime() during startup.",
      "TASK_RUNTIME_NOT_INITIALIZED"
    );
  }

  return runtime;
}

export async function submitTask<TInput>(
  name: string,
  input: TInput,
  meta?: TaskMetadata
): Promise<string> {
  const ensuredRuntime = await ensureTaskRuntime();
  return ensuredRuntime.submit(name, input, meta);
}

export async function cancelTask(taskId: string): Promise<void> {
  const ensuredRuntime = await ensureTaskRuntime();
  return ensuredRuntime.cancel(taskId);
}

export function resetTaskRuntime(): void {
  runtime = null;
  initializationPromise = null;
  resetTaskRegistry();
}
```

- [ ] **Step 5: Update task registry types**

In `src/lib/tasks/task-registry.ts`, use:

```typescript
import type { TaskRuntime, TaskHandler } from "./types";
```

Use `TaskRuntime` and `TaskHandler<unknown, unknown>` in function signatures. Keep `registerAllTasks` and `resetTaskRegistry` names.

- [ ] **Step 6: Update task runtime index**

Replace `src/lib/tasks/index.ts` with:

```typescript
export * from "./types";
export { createTaskRuntime } from "./engine";
export { createAIContext } from "./ai-context";
export { TaskCancelledError, throwIfCancelled } from "./cancellation";
export {
  initializeDefaultTaskRuntime,
  getTaskRuntime,
  submitTask,
  cancelTask,
  resetTaskRuntime,
} from "./runtime";
```

- [ ] **Step 7: Update production imports**

Run:

```bash
rg -n "@/lib/flow|FlowEngine|FlowTask|FlowContext|createFlowEngine|initializeDefaultFlowRuntime|getFlowEngine|submitFlowTask|cancelFlowTask|resetFlowRuntime" src -g "*.ts" -g "*.tsx"
```

Apply these replacements in production source:

```text
@/lib/flow -> @/lib/tasks
@/lib/flow/runtime -> @/lib/tasks/runtime
@/lib/flow/engine -> @/lib/tasks/engine
@/lib/flow/types -> @/lib/tasks/types
FlowContext -> TaskContext
FlowTaskHandler -> TaskHandler
FlowTaskDefinition -> TaskDefinition
FlowTaskMetadata -> TaskMetadata
initializeDefaultFlowRuntime -> initializeDefaultTaskRuntime
getFlowEngine -> getTaskRuntime
submitFlowTask -> submitTask
cancelFlowTask -> cancelTask
resetFlowRuntime -> resetTaskRuntime
createFlowEngine -> createTaskRuntime
```

In `src/instrumentation.ts`, the startup block must import:

```typescript
const { initializeDefaultTaskRuntime } = await import("@/lib/tasks/runtime");
await initializeDefaultTaskRuntime();
```

- [ ] **Step 8: Update tests imports and expectations**

Run:

```bash
rg -n "@/lib/flow|FlowEngine|FlowTask|FlowContext|createFlowEngine|initializeDefaultFlowRuntime|getFlowEngine|submitFlowTask|cancelFlowTask|resetFlowRuntime" tests -g "*.ts" -g "*.tsx"
```

Apply the same replacements as Step 7. Example test import:

```typescript
import { createTaskRuntime, type TaskContext, type TaskHandler } from "@/lib/tasks";
```

Example runtime construction:

```typescript
const runtime = createTaskRuntime({ maxConcurrentTasks: 1 });
```

- [ ] **Step 9: Run focused task tests**

Run:

```bash
npx vitest run tests/integration/tasks tests/unit/lib/tasks tests/integration/task-queue tests/unit/modules/source-document/application/tasks/parse-source-document.test.ts tests/unit/ledger/application/tasks/categorize-entry.test.ts tests/unit/ledger/application/tasks/generate-category-metadata.test.ts tests/unit/architecture/backend-simplification.test.ts
```

Expected: task tests PASS. Governance FAILS only on the Task 4 and Task 5 target-shape checks that intentionally remain incomplete.

- [ ] **Step 10: Run typecheck**

Run:

```bash
npm run tsc
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/tasks src/instrumentation.ts src/modules tests/unit/lib/tasks tests/integration/tasks tests/unit/architecture/backend-simplification.test.ts
git add -u src/lib/flow
git add -u tests/unit/lib/flow tests/integration/flow
git commit -m "refactor: move flow runtime to tasks"
```

## Task 4: Flatten Source-Document Query Names

**Files:**
- Delete: `src/modules/source-document/application/queries/source-document-queries.ts`
- Modify: `src/modules/source-document/application/queries/list-source-document-page.ts`
- Modify: `src/modules/source-document/application/queries/list-source-document-collection.ts`
- Modify: `src/modules/source-document/server-actions/queries.ts`
- Modify: `src/app/api/v1/source-documents/route.ts`
- Modify: source-document query tests
- Modify: `tests/unit/architecture/backend-simplification.test.ts`

- [ ] **Step 1: Rename normalized page query**

In `src/modules/source-document/application/queries/list-source-document-page.ts`, rename:

```typescript
export async function listSourceDocumentsQuery(
```

to:

```typescript
export async function querySourceDocumentPage(
```

Update the validated domain function to call the new helper:

```typescript
export async function listSourceDocuments(
  ledgerId: string,
  params: ListSourceDocumentsInput
): Promise<SourceDocumentPageDto> {
  const validated = parseListSourceDocumentsInput(params);
  return querySourceDocumentPage(ledgerId, {
    status: validated.status ?? null,
    startDate: validated.startDate ?? null,
    endDate: validated.endDate ?? null,
    cursor: validated.cursor ?? null,
    limit: validated.limit,
    includeLedgerEntries: validated.includeEntries,
  });
}
```

- [ ] **Step 2: Rename normalized collection query**

In `src/modules/source-document/application/queries/list-source-document-collection.ts`, rename:

```typescript
export async function listSourceDocumentCollectionQuery(
```

to:

```typescript
export async function querySourceDocumentCollection(
```

Update `getSourceDocumentCollection` to call `querySourceDocumentCollection`.

- [ ] **Step 3: Remove duplicate server-action alias**

In `src/modules/source-document/server-actions/queries.ts`, remove this exported function:

```typescript
export async function listSourceDocuments(
  ledgerId: string,
  params: ListSourceDocumentsInput
): Promise<SourceDocumentPageDto> {
  return listSourceDocumentsPage(ledgerId, params);
}
```

Import the domain function directly:

```typescript
import { listSourceDocuments } from "@/modules/source-document/application/queries/list-source-document-page";
```

Use it in `getSourceDocumentsAction`:

```typescript
export const getSourceDocumentsAction = withLedgerAccess(
  async (ledgerId: string, params: ListSourceDocumentsInput): Promise<SourceDocumentPageDto> =>
    listSourceDocuments(ledgerId, params)
);
```

- [ ] **Step 4: Keep API v1 GET on domain query**

In `src/app/api/v1/source-documents/route.ts`, keep:

```typescript
import { listSourceDocuments } from "@/modules/source-document/application/queries/list-source-document-page";
```

Do not call `getSourceDocumentsAction` from API v1 because API v1 uses service credential auth, not session auth.

- [ ] **Step 5: Delete source-document query barrel**

Run:

```bash
rm src/modules/source-document/application/queries/source-document-queries.ts
```

- [ ] **Step 6: Update tests**

Run:

```bash
rg -n "source-document-queries|listSourceDocumentsQuery|listSourceDocumentCollectionQuery" tests src -g "*.ts" -g "*.tsx"
```

Apply replacements:

```text
listSourceDocumentsQuery -> querySourceDocumentPage
listSourceDocumentCollectionQuery -> querySourceDocumentCollection
@/modules/source-document/application/queries/source-document-queries -> concrete query file imports
```

If `tests/integration/modules/source-document/application/queries/source-document-queries.test.ts` only asserts the barrel exports, delete it:

```bash
rm tests/integration/modules/source-document/application/queries/source-document-queries.test.ts
```

If it contains behavior assertions, move them into focused query tests before deleting the file.

- [ ] **Step 7: Run focused source-document tests**

Run:

```bash
npx vitest run tests/unit/modules/source-document/application/queries tests/integration/source-document/source-document-query-actions.test.ts tests/integration/api/source-documents-route.test.ts tests/integration/api/v1-query-endpoints.test.ts tests/unit/architecture/backend-simplification.test.ts
```

Expected: source-document tests PASS. Governance FAILS only on the Task 5 optional-backend-barrel checks that intentionally remain incomplete.

- [ ] **Step 8: Run typecheck**

Run:

```bash
npm run tsc
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/source-document/application/queries/list-source-document-page.ts src/modules/source-document/application/queries/list-source-document-collection.ts src/modules/source-document/server-actions/queries.ts src/app/api/v1/source-documents/route.ts tests/unit/architecture/backend-simplification.test.ts tests/unit/modules/source-document/application/queries
git add -u src/modules/source-document/application/queries/source-document-queries.ts tests/integration/modules/source-document/application/queries/source-document-queries.test.ts
git commit -m "refactor: flatten source document query entrypoints"
```

## Task 5: Delete Optional Backend Barrels

**Files:**
- Delete: `src/modules/auth/use-cases.ts`
- Delete: `src/modules/auth/queries.ts`
- Delete: `src/modules/currency/use-cases.ts`
- Delete: `src/modules/stats/queries.ts`
- Delete: `src/modules/workspace/use-cases.ts`
- Delete: `src/modules/workspace/queries.ts`
- Modify: all imports that reference those files
- Modify: `tests/unit/architecture/backend-simplification.test.ts`

- [ ] **Step 1: List current optional-barrel imports**

Run:

```bash
rg -n "@/modules/(auth/(use-cases|queries)|currency/use-cases|stats/queries|workspace/(use-cases|queries))" src tests -g "*.ts" -g "*.tsx"
```

Expected: hits in `src/auth.ts`, auth server actions, protected app pages, workspace pages, stats bootstrap, currency conversion callers, and tests.

- [ ] **Step 2: Replace auth imports**

Use these mappings:

```text
@/modules/auth/use-cases authenticateWithOTP -> @/modules/auth/application/use-cases/authenticate-with-otp
@/modules/auth/use-cases OTP*SignInError -> @/modules/auth/application/use-cases/authenticate-with-otp
@/modules/auth/use-cases deleteAccount -> @/modules/auth/application/use-cases/delete-account
@/modules/auth/use-cases handleAuthUserCreated -> @/modules/auth/application/use-cases/handle-auth-user-created
@/modules/auth/use-cases handleAuthUserSignedIn -> @/modules/auth/application/use-cases/handle-auth-user-signed-in
@/modules/auth/use-cases isAuthSignInAllowed -> @/modules/auth/application/use-cases/is-auth-sign-in-allowed
@/modules/auth/use-cases RegistrationDisabledError -> @/modules/auth/application/use-cases/registration-policy
@/modules/auth/use-cases sendOTP -> @/modules/auth/application/use-cases/send-otp
@/modules/auth/use-cases changeEmail -> @/modules/auth/application/use-cases/change-email
@/modules/auth/use-cases clearUserData -> @/modules/auth/application/use-cases/clear-user-data
@/modules/auth/queries getSessionUser -> @/modules/auth/application/queries/get-session-user
```

In `src/auth.ts`, replace the grouped barrel import with concrete imports:

```typescript
import { authenticateWithOTP } from "@/modules/auth/application/use-cases/authenticate-with-otp";
import { handleAuthUserCreated } from "@/modules/auth/application/use-cases/handle-auth-user-created";
import { handleAuthUserSignedIn } from "@/modules/auth/application/use-cases/handle-auth-user-signed-in";
import { isAuthSignInAllowed } from "@/modules/auth/application/use-cases/is-auth-sign-in-allowed";
import { getSessionUser } from "@/modules/auth/application/queries/get-session-user";
```

- [ ] **Step 3: Replace currency imports**

Use these mappings:

```text
@/modules/currency/use-cases convertCurrency -> @/modules/currency/application/use-cases/convert-currency
@/modules/currency/use-cases convertEntryAmount -> @/modules/currency/application/use-cases/convert-entry-amount
@/modules/currency/use-cases convertAmountsBatch -> @/modules/currency/application/use-cases/convert-amounts-batch
```

Update at least:

```text
src/modules/ledger/application/use-cases/mutate-ledger-entries.ts
src/modules/source-document/application/parse-source-document/entry-builder.ts
```

- [ ] **Step 4: Replace workspace and stats imports**

Use these mappings:

```text
@/modules/workspace/use-cases ensureUserLedger -> @/modules/workspace/application/use-cases/ensure-user-ledger
@/modules/workspace/use-cases resolveHome -> @/modules/workspace/application/use-cases/resolve-home
@/modules/workspace/queries getLedgerPageBootstrap -> @/modules/workspace/application/queries/get-ledger-page-bootstrap
@/modules/stats/queries getEnhancedStats -> @/modules/stats/application/queries/get-enhanced-stats
```

Update known production callers:

```text
src/app/[locale]/(protected)/page.tsx
src/app/[locale]/(protected)/ledger/[id]/page.tsx
src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts
src/modules/auth/application/use-cases/authenticate-with-otp.ts
src/modules/auth/application/use-cases/handle-auth-user-created.ts
src/modules/auth/application/use-cases/handle-auth-user-signed-in.ts
```

- [ ] **Step 5: Delete optional barrel files**

Run:

```bash
rm src/modules/auth/use-cases.ts
rm src/modules/auth/queries.ts
rm src/modules/currency/use-cases.ts
rm src/modules/stats/queries.ts
rm src/modules/workspace/use-cases.ts
rm src/modules/workspace/queries.ts
```

- [ ] **Step 6: Verify no imports remain**

Run:

```bash
rg -n "@/modules/(auth/(use-cases|queries)|currency/use-cases|stats/queries|workspace/(use-cases|queries))" src tests -g "*.ts" -g "*.tsx"
```

Expected: no output.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npx vitest run tests/unit/architecture/backend-simplification.test.ts tests/unit/auth tests/integration/auth tests/unit/modules/currency tests/integration/currency-fallbacks.test.ts tests/unit/workspace tests/integration/api/v1-query-endpoints.test.ts tests/integration/stats-currency-conversion.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run typecheck**

Run:

```bash
npm run tsc
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src tests/unit/architecture/backend-simplification.test.ts
git add -u src/modules/auth/use-cases.ts src/modules/auth/queries.ts src/modules/currency/use-cases.ts src/modules/stats/queries.ts src/modules/workspace/use-cases.ts src/modules/workspace/queries.ts
git commit -m "refactor: delete optional backend barrels"
```

## Task 6: Final Verification And Stale Test Cleanup

**Files:**
- Modify: stale tests that assert removed internal names instead of behavior
- Modify: `tests/unit/architecture/backend-simplification.test.ts`

- [ ] **Step 1: Scan for obsolete paths and names**

Run:

```bash
rg -n "@/lib/flow|src/lib/flow|FlowEngine|FlowEngineConfig|FlowContext|FlowTask|createFlowEngine|initializeDefaultFlowRuntime|getFlowEngine|submitFlowTask|cancelFlowTask|resetFlowRuntime|@/lib/env/defaults|@/lib/env/catalog|source-document-queries|@/modules/(auth/(use-cases|queries)|currency/use-cases|stats/queries|workspace/(use-cases|queries))" src tests -g "*.ts" -g "*.tsx"
find tests \( -path "tests/integration/flow*" -o -path "tests/unit/lib/flow*" -o -name "flow-engine.test.ts" -o -name "basic-flow.test.ts" \) -print
```

Expected: both commands print no output.

- [ ] **Step 2: Keep behavior tests, remove stale structure assertions**

For any failing test, keep assertions covering:

```text
auth and ledger access
env validation and live runtime getters
task submit, cancel, progress, deduplication, token usage
source document query behavior
API v1 contracts
multi-user isolation
currency conversion
AI parse pipeline behavior
```

Delete only assertions that require removed paths or old `Flow*` names.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run tsc
```

Expected: PASS.

- [ ] **Step 5: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 6: Run integration tests**

Run:

```bash
npm run test:integration
```

Expected: PASS.

- [ ] **Step 7: Run build and i18n validation**

Run:

```bash
npm run build
node scripts/validate-i18n-catalogs.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit final cleanup**

```bash
git add src tests docs/architecture/coding-patterns.md
git commit -m "test: verify strong backend simplification"
```

## Execution Notes

- Keep the existing untracked `docs/superpowers/plans/2026-07-07-auth-email-only.md` untouched unless the user explicitly asks to manage it.
- Do not change API v1 response bodies, status codes, request shapes, or service credential authentication.
- Do not change source document parsing prompts, model selection semantics, or AI result schemas.
- Do not remove DTO mappers, ledger access wrappers, service credential auth, rate limiting, or API v1 helper.
- Do not merge Server Actions into application use cases.
- Do not add replacement pass-through barrels after deleting optional backend barrels.
- Prefer one commit per task exactly as listed above.

## Final Verification Set

Run these before marking the implementation complete:

```bash
npm run lint
npm run tsc
npm run test:unit
npm run test:integration
npm run build
node scripts/validate-i18n-catalogs.mjs
```
