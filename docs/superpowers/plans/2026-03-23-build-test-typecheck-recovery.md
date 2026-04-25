# Build, Test, And Typecheck Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a green `npm run build`, green targeted failing tests, and a real passing `npm run tsc` / `npm run check` flow without reintroducing deprecated module entry files or relaxing strict TypeScript settings.

**Architecture:** Treat this as a stabilization track, not a refactor. First repair the two currently user-visible blockers: the stale auth access entrypoint and the forbidden empty component directories. Then expose a dedicated `tsc` script, fix the remaining product-code type errors before test-only type drift, and only after `npm run tsc` is green fold it into `npm run check` so CI starts enforcing it.

**Tech Stack:** Next.js 16, TypeScript 5, Vitest 4, React 19, TanStack Query 5, strict TS flags (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`)

---

## Scope Check

This request spans one immediate runtime/build break plus a broader strict-type cleanup across several independent areas. Keep it in **two PR tracks** even if one engineer executes the whole plan:

1. Runtime/test blocker recovery
2. Typecheck recovery + CI enforcement

Do not merge Track 2 halfway through. `npm run tsc` should be made real first, but `npm run check` should only start depending on it after the full type backlog in this plan is cleared.

## File Map

### Track A: Runtime/Test Blockers

- `src/modules/auth/access.ts`
  - Broken public access entrypoint. Replace the stale `./helpers` re-export with the real `getCurrentUser` implementation.
- `tests/integration/auth/auth-helpers.test.ts`
  - Existing failing regression coverage for `getCurrentUser` and `requireLedgerAccess`; keep this as the primary auth-access verification.
- `src/components/auth`
  - Empty placeholder directory that the repo-hygiene governance test forbids.
- `src/components/entries`
  - Empty placeholder directory that the repo-hygiene governance test forbids.
- `src/components/stats`
  - Empty placeholder directory that the repo-hygiene governance test forbids.
- `tests/unit/tooling/repo-hygiene-governance.test.ts`
  - Existing governance guard; use it to prove the placeholder directories are actually gone.

### Track B: Typecheck Recovery In Product Code

- `package.json`
  - Add a dedicated `tsc` script first; only later wire it into `check`.
- `src/modules/source-document/application/parse-source-document/pipeline.ts`
  - Narrow the Stage 2 result before reading `output.wasArbitrated`.
- `src/modules/source-document/hooks/useSourceDocumentInputController.ts`
  - Stop passing explicit `undefined` into option bags that are checked under `exactOptionalPropertyTypes`.
- `src/modules/workspace/application/use-cases/resolve-home.ts`
  - Remove the stale import from deleted `../../contracts` and define the return contract at the current ownership boundary.
- `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
  - Regression test for the Stage 2 pipeline behavior after the type-safe narrowing change.
- `tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`
  - Existing controller coverage; rerun after the conditional-option change.
- `tests/unit/workspace/resolve-home.test.ts`
  - Existing behavior coverage; rerun after the return-type cleanup.

### Track C: Typecheck Recovery In Tests

- `tests/helpers/react-query.ts`
  - New shared helper that turns a `queryKey` into a minimal `Query`-shaped test object for predicate assertions.
- `tests/unit/auth/auth-events.test.ts`
  - Update mocked callback param typing so it matches the production `locale` field.
- `tests/unit/components/SettingsTab.test.tsx`
  - Use the shared query helper when invoking `invalidateQueries` predicates.
- `tests/unit/components/workspace-pull-to-refresh.test.tsx`
  - Use the shared query helper and update `PeriodParams` to the current `period` contract.
- `tests/unit/modules/source-document/hooks/useSourceDocumentSubmitMutations.test.tsx`
  - Use the shared query helper for `cancelQueries`/`invalidateQueries` predicate assertions.
- `tests/unit/components/ui/image-editor.test.tsx`
  - Make the mock canvas context intentionally cast through `unknown`.
- `tests/unit/instrumentation.test.ts`
  - Guard `mock.invocationCallOrder` reads before comparing them.
- `tests/unit/lib/env/catalog.test.ts`
  - Guard regex capture groups before adding them to `usedKeys`.
- `tests/unit/lib/env/startup.test.ts`
  - Build a test env object that actually satisfies the stricter `ProcessEnv` expectations.
- `tests/unit/modules/task-queue/ui/taskQueueModal.selectors.test.ts`
  - Stop passing explicit `undefined` through `Partial<QueueItem>` overrides under `exactOptionalPropertyTypes`.
- `tests/unit/modules/task-queue/ui/useTaskQueueModalActions.test.ts`
  - Fill in the now-required mutation stubs, widen the hook-prop typing, and remove impossible narrowed state in `initialProps`.

## Non-Goals

- Do not recreate `src/modules/auth/helpers.ts`.
- Do not recreate `src/modules/workspace/contracts.ts`.
- Do not disable `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, or `strict`.
- Do not loosen the repo-hygiene governance test to allow the empty component directories back in.

### Task 1: Repair The Broken Auth Access Entrypoint

**Files:**
- Modify: `src/modules/auth/access.ts`
- Test: `tests/integration/auth/auth-helpers.test.ts`

- [ ] **Step 1: Reproduce the auth access failure**

Run: `npm run test:integration -- tests/integration/auth/auth-helpers.test.ts`
Expected: FAIL with `Cannot find module './helpers' imported from src/modules/auth/access.ts`

- [ ] **Step 2: Replace the stale re-export with the real `getCurrentUser` implementation**

Use this shape in `src/modules/auth/access.ts`:

```ts
import { auth } from "@/auth";

export async function getCurrentUser(): Promise<{
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
} | null> {
  const session = await auth();
  const user = session?.user;

  if (user?.id == null || user.id === "") {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    image: user.image ?? null,
  };
}
```

- [ ] **Step 3: Re-run the targeted integration test**

Run: `npm run test:integration -- tests/integration/auth/auth-helpers.test.ts`
Expected: PASS

- [ ] **Step 4: Confirm the auth access error is gone from TypeScript**

Run:

```bash
npx tsc --noEmit --pretty false 2>&1 | rg 'src/modules/auth/access'
```

Expected: no output

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/access.ts tests/integration/auth/auth-helpers.test.ts
git commit -m "fix: restore auth access entrypoint"
```

### Task 2: Remove Forbidden Empty Placeholder Component Directories

**Files:**
- Delete directory: `src/components/auth`
- Delete directory: `src/components/entries`
- Delete directory: `src/components/stats`
- Test: `tests/unit/tooling/repo-hygiene-governance.test.ts`

- [ ] **Step 1: Reproduce the repo-hygiene failure**

Run: `npm run test:unit -- tests/unit/tooling/repo-hygiene-governance.test.ts`
Expected: FAIL because `src/components/auth`, `src/components/entries`, and `src/components/stats` still exist

- [ ] **Step 2: Remove the forbidden directories**

Run:

```bash
rmdir src/components/auth src/components/entries src/components/stats
```

Expected: the directories are deleted cleanly; if `rmdir` fails, stop and inspect because these should remain empty placeholder dirs only

- [ ] **Step 3: Re-run the governance test**

Run: `npm run test:unit -- tests/unit/tooling/repo-hygiene-governance.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A src/components/auth src/components/entries src/components/stats
git commit -m "chore: remove forbidden placeholder component dirs"
```

### Task 3: Add A Real `tsc` Script Without Gating CI Yet

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Reproduce the missing script problem**

Run: `npm run tsc`
Expected: FAIL with `Missing script: "tsc"`

- [ ] **Step 2: Add the dedicated typecheck script**

Update `package.json` scripts to include:

```json
{
  "scripts": {
    "tsc": "tsc --noEmit"
  }
}
```

Do not add `npm run tsc` to `check` yet.

- [ ] **Step 3: Confirm the script now runs the real project typecheck**

Run: `npm run tsc -- --pretty false`
Expected: FAIL with real TypeScript errors from source files and tests, not with `Missing script`

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add explicit typecheck script"
```

### Task 4: Clear Product-Code Type Errors First

**Files:**
- Modify: `src/modules/source-document/application/parse-source-document/pipeline.ts`
- Modify: `src/modules/source-document/hooks/useSourceDocumentInputController.ts`
- Modify: `src/modules/workspace/application/use-cases/resolve-home.ts`
- Test: `tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts`
- Test: `tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx`
- Test: `tests/unit/workspace/resolve-home.test.ts`

- [ ] **Step 1: Capture the product-code type failures**

Run:

```bash
npm run tsc -- --pretty false 2>&1 | rg 'src/modules/source-document/application/parse-source-document/pipeline|src/modules/source-document/hooks/useSourceDocumentInputController|src/modules/workspace/application/use-cases/resolve-home'
```

Expected: output includes the three current product-code errors

- [ ] **Step 2: Narrow Stage 2 before reading `output.wasArbitrated`**

Refactor `pipeline.ts` so the log only reads `stage2Result.output.wasArbitrated` in the success branch. One acceptable shape:

```ts
const stage2Result = await executeStage2(...);
if (stage2Result.kind === "anomaly") {
  logger.info({ docId: ctx.docId }, "Stage 2: Arbitration failed");
  return resolveStage2ExecutionResult(stage2Result);
}

const stage2Decision = resolveStage2ExecutionResult(stage2Result);
logger.info(
  {
    docId: ctx.docId,
    entryCount: stage2Decision.ledgerEntries.length,
    wasArbitrated: stage2Result.output.wasArbitrated,
  },
  "Stage 2: Parsing completed"
);

return stage2Decision;
```

- [ ] **Step 3: Stop passing explicit `undefined` into source-document controller option bags**

Update `useSourceDocumentInputController.ts` to omit optional props when absent:

```ts
const draft = useSourceDocumentInputDraft({
  ...(sourceDocumentId != null ? { sourceDocumentId } : {}),
  ...(initialData != null ? { initialData } : {}),
});

const submitMutations = useSourceDocumentSubmitMutations({
  ledgerId,
  mode,
  messages,
  ...(sourceDocumentId != null ? { sourceDocumentId } : {}),
});
```

- [ ] **Step 4: Remove the stale deleted-contract import from `resolve-home.ts`**

Keep the type at the current file boundary instead of importing `../../contracts`:

```ts
type ResolveHomeResult =
  | { kind: "redirect-created"; ledgerId: string }
  | { kind: "redirect-existing"; ledgerId: string };
```

- [ ] **Step 5: Re-run the owned unit tests**

Run:

```bash
npm run test:unit -- \
  tests/unit/modules/source-document/application/parse-source-document/pipeline.test.ts \
  tests/unit/modules/source-document/hooks/useSourceDocumentInputController.test.tsx \
  tests/unit/workspace/resolve-home.test.ts
```

Expected: PASS

- [ ] **Step 6: Re-run the filtered typecheck**

Run:

```bash
npm run tsc -- --pretty false 2>&1 | rg 'src/modules/source-document/application/parse-source-document/pipeline|src/modules/source-document/hooks/useSourceDocumentInputController|src/modules/workspace/application/use-cases/resolve-home'
```

Expected: no output

- [ ] **Step 7: Commit**

```bash
git add \
  src/modules/source-document/application/parse-source-document/pipeline.ts \
  src/modules/source-document/hooks/useSourceDocumentInputController.ts \
  src/modules/workspace/application/use-cases/resolve-home.ts
git commit -m "fix: clear product code typecheck blockers"
```

### Task 5: Fix Strict Test Typing Around Auth And React Query Predicates

**Files:**
- Create: `tests/helpers/react-query.ts`
- Modify: `tests/unit/auth/auth-events.test.ts`
- Modify: `tests/unit/components/SettingsTab.test.tsx`
- Modify: `tests/unit/components/workspace-pull-to-refresh.test.tsx`
- Modify: `tests/unit/modules/source-document/hooks/useSourceDocumentSubmitMutations.test.tsx`

- [ ] **Step 1: Capture this test-only error slice**

Run:

```bash
npm run tsc -- --pretty false 2>&1 | rg 'auth-events|SettingsTab|workspace-pull-to-refresh|useSourceDocumentSubmitMutations'
```

Expected: output includes the locale mismatch, the `PeriodParams` mismatch, and the React Query predicate invocation errors

- [ ] **Step 2: Add a shared helper for predicate assertions**

Create `tests/helpers/react-query.ts` with a tiny helper:

```ts
import type { Query } from "@tanstack/react-query";

export function asQueryLike(queryKey: readonly unknown[]) {
  return { queryKey } as unknown as Query<unknown, Error, unknown, readonly unknown[]>;
}
```

- [ ] **Step 3: Update the affected tests to match current contracts**

Apply these concrete fixes:

```ts
// tests/unit/auth/auth-events.test.ts
type SignInEvent = (params: {
  user: { id?: string | null; email?: string | null; locale?: string | null };
  isNewUser?: boolean;
}) => Promise<void>;

// tests/unit/components/workspace-pull-to-refresh.test.tsx
const periodParams: PeriodParams = { period: "month" };

// tests using predicate callbacks
expect(predicate(asQueryLike(queryKeys.taskQueue("ledger-1")))).toBe(true);
```

Use the new `asQueryLike` helper in `SettingsTab.test.tsx`, `workspace-pull-to-refresh.test.tsx`, and `useSourceDocumentSubmitMutations.test.tsx`.

- [ ] **Step 4: Re-run the owned tests**

Run:

```bash
npm run test:unit -- \
  tests/unit/auth/auth-events.test.ts \
  tests/unit/components/SettingsTab.test.tsx \
  tests/unit/components/workspace-pull-to-refresh.test.tsx \
  tests/unit/modules/source-document/hooks/useSourceDocumentSubmitMutations.test.tsx
```

Expected: PASS

- [ ] **Step 5: Re-run the filtered typecheck**

Run:

```bash
npm run tsc -- --pretty false 2>&1 | rg 'auth-events|SettingsTab|workspace-pull-to-refresh|useSourceDocumentSubmitMutations'
```

Expected: no output

- [ ] **Step 6: Commit**

```bash
git add \
  tests/helpers/react-query.ts \
  tests/unit/auth/auth-events.test.ts \
  tests/unit/components/SettingsTab.test.tsx \
  tests/unit/components/workspace-pull-to-refresh.test.tsx \
  tests/unit/modules/source-document/hooks/useSourceDocumentSubmitMutations.test.tsx
git commit -m "test: align query predicate and auth event typings"
```

### Task 6: Fix The Remaining Strict Test Fixtures

**Files:**
- Modify: `tests/unit/components/ui/image-editor.test.tsx`
- Modify: `tests/unit/instrumentation.test.ts`
- Modify: `tests/unit/lib/env/catalog.test.ts`
- Modify: `tests/unit/lib/env/startup.test.ts`
- Modify: `tests/unit/modules/task-queue/ui/taskQueueModal.selectors.test.ts`
- Modify: `tests/unit/modules/task-queue/ui/useTaskQueueModalActions.test.ts`

- [ ] **Step 1: Capture the remaining test-fixture type errors**

Run:

```bash
npm run tsc -- --pretty false 2>&1 | rg 'image-editor|instrumentation|env/catalog|env/startup|taskQueueModal.selectors|useTaskQueueModalActions'
```

Expected: output includes the mock canvas cast error, invocation-order / env typing issues, and the task-queue fixture errors

- [ ] **Step 2: Apply the concrete fixture fixes**

Use these patterns:

```ts
// tests/unit/components/ui/image-editor.test.tsx
const canvasGetContext = vi.fn(
  () => mockCanvasContext as unknown as CanvasRenderingContext2D
);

// tests/unit/instrumentation.test.ts
const validateOrder = validateStartupEnv.mock.invocationCallOrder.at(0);
const initializeOrder = initializeDefaultFlowRuntime.mock.invocationCallOrder.at(0);
expect(validateOrder).toBeDefined();
expect(initializeOrder).toBeDefined();
expect(validateOrder!).toBeLessThan(initializeOrder!);

// tests/unit/lib/env/catalog.test.ts
const key = match[1];
if (key != null) {
  usedKeys.add(key);
}

// tests/unit/lib/env/startup.test.ts
const baseEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "file:./data/sqlite.db",
  OPENAI_API_KEY: "sk-test",
  AUTH_SECRET: "auth-secret",
  AUTH_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
} satisfies NodeJS.ProcessEnv;
```

For the task-queue tests:

```ts
function createItem(overrides: Partial<QueueItem> = {}): QueueItem {
  const { sourceDocumentId, taskId, ...rest } = overrides;
  return {
    id: "item-1",
    kind: "task",
    status: "failed",
    title: "Queue item",
    createdAt: new Date().toISOString(),
    ...rest,
    ...(sourceDocumentId !== undefined ? { sourceDocumentId } : {}),
    ...(taskId !== undefined ? { taskId } : {}),
  };
}

function createMutations() {
  return {
    deleteSourceDocument: { mutate: vi.fn() },
    batchDelete: { mutate: vi.fn() },
    batchRetry: { mutate: vi.fn() },
    cancelTask: { mutate: vi.fn() },
    batchCancel: { mutate: vi.fn() },
    dismissTask: { mutate: vi.fn() },
    batchDismiss: { mutate: vi.fn() },
  };
}
```

Also widen the hook render props so the rerendered `deleteConfirm` can legally use both `"single"` and `"all"` states.

- [ ] **Step 3: Re-run the owned tests**

Run:

```bash
npm run test:unit -- \
  tests/unit/components/ui/image-editor.test.tsx \
  tests/unit/instrumentation.test.ts \
  tests/unit/lib/env/catalog.test.ts \
  tests/unit/lib/env/startup.test.ts \
  tests/unit/modules/task-queue/ui/taskQueueModal.selectors.test.ts \
  tests/unit/modules/task-queue/ui/useTaskQueueModalActions.test.ts
```

Expected: PASS

- [ ] **Step 4: Run the full project typecheck**

Run: `npm run tsc -- --pretty false`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  tests/unit/components/ui/image-editor.test.tsx \
  tests/unit/instrumentation.test.ts \
  tests/unit/lib/env/catalog.test.ts \
  tests/unit/lib/env/startup.test.ts \
  tests/unit/modules/task-queue/ui/taskQueueModal.selectors.test.ts \
  tests/unit/modules/task-queue/ui/useTaskQueueModalActions.test.ts
git commit -m "test: fix strict typecheck drift in fixtures"
```

### Task 7: Start Enforcing Typecheck In Unified Verification

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `npm run tsc` to the unified verification script**

Update `package.json`:

```json
{
  "scripts": {
    "check": "npm run lint && npm run tsc && npm run test:unit && npm run test:integration && npm run build && npm run validate:i18n"
  }
}
```

- [ ] **Step 2: Run the unified verification command**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "ci: enforce typecheck in unified verification"
```

## Final Verification

- [ ] `npm run test:integration -- tests/integration/auth/auth-helpers.test.ts`
- [ ] `npm run test:unit -- tests/unit/tooling/repo-hygiene-governance.test.ts`
- [ ] `npm run build`
- [ ] `npm run tsc -- --pretty false`
- [ ] `npm run check`

## Notes For The Implementer

- Prefer deleting stale structure over reintroducing deprecated files. `auth/access.ts` and `resolve-home.ts` should own their current contracts directly.
- Keep `tests/helpers/react-query.ts` tiny. It exists only to satisfy TanStack Query’s stricter `predicate` input typing without copy-pasting `unknown as Query` all over the suite.
- When fixing `exactOptionalPropertyTypes` failures, omit properties instead of passing `undefined` unless the actual runtime contract explicitly includes `undefined`.
