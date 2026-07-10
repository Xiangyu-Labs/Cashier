# Remove Retired Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the product capabilities explicitly retired by the approved Vercel and Cloudflare rewrite design while keeping the current SQLite, local-file, and in-process parsing application usable until the infrastructure migration begins.

**Architecture:** Treat this as a product-surface reduction, not an infrastructure rewrite. Delete user-facing task management, batch retry/delete, public read APIs, export, historical AI categorization, AI category metadata generation, image crop/draw editing, retired account mutations, aggressive PWA navigation/push behavior, real-AI smoke infrastructure, and Docker production deployment. Preserve the internal task runtime, Stream batch date editing, single-document retry/delete, source-document status rendering, manual category editing, authenticated application queries, SQLite, local storage, the existing AI parse pipeline, and a minimal installable PWA shell.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, next-intl, Drizzle/SQLite, TanStack Query.

---

## Scope Guardrails

Retire now:

- standalone task center and its task list/stats APIs;
- user-triggered cancel and dismiss task actions;
- source-document batch retry and batch delete;
- ledger-entry batch delete and the selection UI that exposed batch AI categorization/delete;
- public API v1 reads for categories, entries, stats, tasks, and source documents;
- ledger export;
- historical-entry AI auto-categorization;
- AI category icon/description generation;
- image crop and draw editing;
- change email, clear data, and delete account;
- aggressive frontend navigation/API/RSC/auth caching and Push Worker behavior;
- real-provider AI smoke tests and their dedicated Vitest project;
- Docker image, Compose deployment, GHCR publishing, and Docker documentation/scripts.

Preserve until later infrastructure phases:

- `src/lib/tasks/**`, task-run persistence, and internal task cancellation used by source-document delete/retry;
- `parse_source_document` task registration and execution;
- single source-document retry, edit retry, manual entry, and delete;
- processing/anomaly/failed status on Stream cards;
- authenticated Details, Stats, Settings, and source-document reads;
- Stream selection and batch source-document date updates;
- source-document detail selection plus batch category/currency updates;
- manual category name, icon, description, ordering, and delete operations;
- image upload, compression, preview, add/remove, and multi-image navigation;
- OTP login, current-email display, sign out, and service credentials;
- PWA manifest, install icons, generated precache, and hashed static-asset caching only;
- SQLite, local file storage, the upload route, and local Node development.

## File Structure

Create:

- `tests/unit/governance/retired-features.test.ts` - permanent negative assertions preventing retired surfaces from returning.
- `tests/unit/governance/pwa-policy.test.ts` - focused RED/GREEN coverage for the retained minimal PWA policy.

Modify:

- `src/modules/workspace/ui/{Header,AppShell,LedgerPageClient,useLedgerDialogState}.tsx` - remove task-center entry and modal state while retaining record creation.
- `src/modules/workspace/ui/{LedgerEntriesTab,LedgerEntriesToolbar,DetailsTab,DetailsToolbar}.tsx` - remove batch retry/delete and top-level Details selection while retaining Stream batch date updates and single-item workflows.
- `src/modules/source-document/**` - remove batch retry/delete exports and editor integration while retaining single-document lifecycle.
- `src/modules/ledger/**` - remove export, batch delete, historical categorization, and metadata-generation boundaries while retaining ordinary entry/category behavior.
- `src/lib/{query-keys.ts,tasks/task-registry.ts}` - remove retired client cache and AI task registrations only.
- `src/modules/ledger/ui/SettingsTab.tsx` - reduce Account to read-only email plus sign out.
- `messages/{en,zh}.json` - delete retired UI copy and keep all still-referenced status copy under active namespaces.
- `package.json`, `package-lock.json` - remove `react-image-crop` and Docker scripts.
- `.github/workflows/ci-cd.yml` - retain CI checks and remove Docker/GHCR publication.
- `next.config.ts` - retain minimal PWA generation while disabling navigation/runtime data caching and Push Worker imports.
- `vitest{,.shared}.config.ts` - remove the real-provider smoke project and stale deleted-test routing.
- `.env.example`, `src/lib/env/{runtime,startup}.ts` - remove export-only configuration and rename the retained task runtime section.
- `README.md`, `docs/runbook.md` - remove Docker deployment guidance while retaining local operation guidance.

Delete:

- `src/modules/task-queue/**`
- `src/app/api/v1/{categories,entries,stats,task}/**`
- task-center, batch retry/delete, export, historical categorization, metadata-generation, image-editor, and retired-account implementation/test files listed in the tasks below
- `.dockerignore`, `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`
- `public/push-worker.js`
- `tests/smoke/**`

### Task 1: Add the retirement governance test

**Files:**

- Create: `tests/unit/governance/retired-features.test.ts`

- [ ] **Step 1: Write a failing filesystem-governance test**

```ts
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const fromRoot = (path: string) => resolve(root, path);

const retiredPaths = [
  "src/modules/task-queue",
  "src/app/api/v1/categories",
  "src/app/api/v1/entries",
  "src/app/api/v1/stats",
  "src/app/api/v1/task",
  "src/modules/ledger/ui/ExportSection.tsx",
  "src/modules/ledger/application/use-cases/export-ledger-entries.ts",
  "src/modules/ledger/application/use-cases/submit-categorize-tasks.ts",
  "src/modules/ledger/application/tasks/categorize-entry.ts",
  "src/modules/ledger/application/tasks/generate-category-metadata.ts",
  "src/modules/ledger/server-actions/categorize.ts",
  "src/components/ui/image-editor.tsx",
  "src/components/ui/image-editor-crop-pane.tsx",
  "src/components/ui/image-editor-draw-pane.tsx",
  "src/components/ui/image-editor-toolbar.tsx",
  "src/components/ui/image-editor.core.ts",
  "src/components/ui/image-editor.types.ts",
  "src/components/ui/image-editor.utils.ts",
  "src/modules/auth/ui/ChangeEmailForm.tsx",
  "src/modules/auth/ui/ClearDataForm.tsx",
  "src/modules/auth/ui/DeleteAccountForm.tsx",
  "Dockerfile",
  "docker-compose.yml",
  "docker-entrypoint.sh",
  ".dockerignore",
  "public/push-worker.js",
  "tests/smoke",
];

describe("retired feature governance", () => {
  it.each(retiredPaths)("keeps %s removed", (path) => {
    expect(existsSync(fromRoot(path))).toBe(false);
  });

  it("keeps API v1 source documents write-only", () => {
    const route = readFileSync(fromRoot("src/app/api/v1/source-documents/route.ts"), "utf8");
    expect(route).toContain("export async function POST");
    expect(route).not.toContain("export async function GET");
  });

  it("keeps retired dependencies and Docker commands out of package.json", () => {
    const manifest = JSON.parse(readFileSync(fromRoot("package.json"), "utf8")) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(manifest.dependencies).not.toHaveProperty("react-image-crop");
    expect(Object.keys(manifest.scripts).some((name) => name.startsWith("docker:"))).toBe(false);
  });

  it("keeps the retained PWA limited to static precaching", () => {
    const config = readFileSync(fromRoot("next.config.ts"), "utf8");
    expect(config).toContain("cacheOnFrontEndNav: false");
    expect(config).toContain("aggressiveFrontEndNavCaching: false");
    expect(config).toContain("cacheStartUrl: false");
    expect(config).toContain("dynamicStartUrl: false");
    expect(config).toContain("runtimeCaching: []");
    expect(config).not.toContain("importScripts");
    expect(existsSync(fromRoot("src/app/manifest.ts"))).toBe(true);
  });

  it("removes retired callable contracts and export configuration", () => {
    const boundaries = [
      "src/modules/ledger/contracts.ts",
      "src/modules/ledger/actions.ts",
      "src/modules/source-document/contracts.ts",
      "src/modules/source-document/actions.ts",
      "src/lib/env/runtime.ts",
      "src/lib/env/startup.ts",
      ".env.example",
    ]
      .map((path) => readFileSync(fromRoot(path), "utf8"))
      .join("\n");
    expect(boundaries).not.toMatch(
      /CategoriesResponseDto|ExportResult|ExportLedgerEntriesOptions|CategorizeResult|BatchDeleteSourceDocumentsResultDto|BatchRetrySourceDocumentItemDto|BatchRetrySourceDocumentsResultDto|ProcessingTaskStatusDto|ProcessingTaskDto|ProcessingStatsDto|sourceDocumentIdsSchema|EXPORT_MAX_ENTRIES/
    );
  });

  it("does not remove infrastructure that is replaced in the next phase", () => {
    expect(existsSync(fromRoot("src/lib/tasks/runtime.ts"))).toBe(true);
    expect(existsSync(fromRoot("src/lib/storage/local.ts"))).toBe(true);
    expect(existsSync(fromRoot("src/persistence/schema/ledger.ts"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run --config vitest.unit.config.ts tests/unit/governance/retired-features.test.ts`

Expected: FAIL because the retired paths, GET handler, dependency, and Docker scripts still exist; the three preserved infrastructure assertions already pass.

- [ ] **Step 3: Leave the test red while Tasks 2-7 remove each prohibited surface**

Do not weaken the retired path list to make intermediate work pass. Run focused existing tests for each task, then expect this governance file to become fully green only after Task 7.

### Task 2: Remove the task center and public task management

**Files:**

- Delete: `src/modules/task-queue/**`
- Delete: `src/app/api/v1/task/items/route.ts`
- Delete: `src/app/api/v1/task/stats/route.ts`
- Delete: `src/modules/source-document/server-actions/processing.ts`
- Delete: `src/modules/source-document/application/queries/source-document-processing.ts`
- Delete: processing-task/stats DTOs and schemas that have no retained caller
- Delete: processing-task/stats integration and unit tests
- Delete: task-queue tests under `tests/integration/modules/task-queue`, `tests/integration/task-queue`, `tests/integration/tasks/dismiss-task-actions.test.ts`, `tests/unit/modules/task-queue`, and `tests/unit/task-queue`
- Modify: `src/modules/workspace/ui/Header.tsx`
- Modify: `src/modules/workspace/ui/AppShell.tsx`
- Modify: `src/modules/workspace/ui/LedgerPageClient.tsx`
- Modify: `src/modules/workspace/ui/useLedgerDialogState.ts`
- Modify: `src/lib/query-keys.ts`
- Modify: `src/modules/{workspace,source-document}/**` callers of `invalidateTaskQueue`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`
- Test: `tests/unit/modules/workspace/ui/Header.test.tsx`
- Test: `tests/unit/lib/query-keys.test.ts`
- Test: `tests/unit/api/v1/public-contract-routes.test.ts`

- [ ] **Step 1: Rewrite Header coverage to require no task-center control**

Keep the create-record assertion and add:

```tsx
expect(screen.queryByRole("button", { name: /task center|任务中心/i })).not.toBeInTheDocument();
await user.click(screen.getByRole("button", { name: /new record|新增记录/i }));
expect(onOpenInput).toHaveBeenCalledOnce();
```

Run: `npx vitest run --config vitest.unit.config.ts tests/unit/modules/workspace/ui/Header.test.tsx`

Expected: FAIL while `Header` still requires and renders `onOpenTaskQueue`.

- [ ] **Step 2: Collapse Header and AppShell to the retained command**

Use this public contract:

```tsx
interface HeaderProps {
  onOpenInput: () => void;
}

export function Header({ onOpenInput }: HeaderProps) {
  const t = useTranslations("LedgerPage");

  return (
    <header className="sticky top-0 z-header border-b border-border bg-surface/90 backdrop-blur-md supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-3 sm:px-4 md:px-6">
        <span className="text-sm font-semibold text-text">Cashier</span>
        <Button
          size="sm"
          onClick={onOpenInput}
          className="h-9 w-9 rounded-md p-0"
          aria-label={t("newRecord")}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
```

`AppShell` accepts only `onOpenInput` and `children`. `LedgerPageClient` removes `useTaskQueue`, the lazy `TaskQueueModal`, `pendingStats`, `isPendingOpen`, and `setIsPendingOpen`. `useLedgerDialogState` keeps only input modal state.

- [ ] **Step 3: Remove task-center modules, routes, cache keys, and tests**

Delete the listed task-center files plus the unreferenced processing-task/stats server actions, query, `ProcessingTaskStatusDto`, `ProcessingTaskDto`, `ProcessingStatsDto`, `ProcessingTasksQueryInput`, schema branches, and tests (`tests/integration/api/{processing-stats,processing-tasks}.test.ts`, `tests/integration/processing-tasks.test.ts`, and `tests/unit/modules/source-document/application/queries/source-document-processing.test.ts`). Remove `queryKeys.taskQueue`, `queryKeys.processingTasks`, and `invalidateTaskQueue`; current Stream status comes from source-document collection queries, not these task-run read models. Remove task-queue invalidation from refresh arrays without changing the other invalidations.

Do not delete `src/lib/tasks/**`, `src/persistence/schema/task-queue.ts`, or internal `cancelTask` calls used by source-document lifecycle code.

- [ ] **Step 4: Move retained processing labels out of `TaskQueue` copy**

`src/modules/source-document/ui/processing-status.tsx` may still render pending/running/failed/anomaly. Point it at a retained source-document namespace and move only the referenced status keys there before deleting the `TaskQueue` translation block.

- [ ] **Step 5: Run focused verification**

Run:

```bash
npx vitest run --config vitest.unit.config.ts tests/unit/modules/workspace/ui/Header.test.tsx tests/unit/lib/query-keys.test.ts tests/unit/api/v1/public-contract-routes.test.ts
npm run tsc
```

Expected: PASS; TypeScript reports no imports from `@/modules/task-queue`.

- [ ] **Step 6: Commit checkpoint after user authorization**

Suggested message: `refactor: remove task center surface`

### Task 3: Remove batch retry/delete while preserving batch edits

**Files:**

- Delete: `src/modules/workspace/ui/BatchActionBar.tsx`
- Delete: `src/modules/source-document/application/use-cases/batch-retry-source-documents.ts`
- Delete: `src/modules/source-document/server-actions/batch-retry.ts`
- Delete: `src/modules/ledger/application/use-cases/batch-delete-ledger-entries.ts`
- Delete: `src/modules/ledger/hooks/useBatchEntryActions.ts`
- Delete: unused `src/modules/source-document/ui/batch-action-toolbar/SourceDocumentBatchActionToolbar.tsx` and its dead barrel exports
- Delete: batch-retry and batch-delete tests only
- Modify: `src/modules/source-document/{actions.ts,server-actions/delete.ts}`
- Modify: `src/modules/source-document/{contracts.ts,contract-schemas.ts}`
- Modify: `src/modules/ledger/{actions.ts,server-actions/entries.ts}`
- Modify: `src/modules/source-document/hooks/useBatchSourceDocumentActions.ts`
- Modify: `src/modules/workspace/ui/{LedgerEntriesTab,LedgerEntriesToolbar,DetailsTab,DetailsToolbar,index}.tsx`
- Modify: `src/modules/source-document/ui/batch-action-toolbar/SourceDocumentActions.tsx`
- Modify: `src/modules/source-document/ui/{SourceDocumentDetailModal,SourceDocumentDetailWrapper}.tsx`
- Modify: `src/modules/source-document/hooks/{useSourceDocumentDetailMutations,useSourceDocumentEntryMutations}.ts`
- Modify: `src/modules/ledger/ui/batch-action-toolbar/{LedgerEntriesActions,LedgerEntriesBatchActionToolbar}.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`
- Test: `tests/unit/modules/workspace/ui/DetailsToolbar.test.tsx`
- Test: retained single source-document delete/retry tests

- [ ] **Step 1: Change toolbar tests to the non-selection contract and verify RED**

The retained toolbar contract is:

```tsx
interface DetailsToolbarProps {
  totalLabel: string;
  children?: ReactNode;
}

render(
  <DetailsToolbar totalLabel="CNY 12.00">
    <button>Filter</button>
  </DetailsToolbar>
);
expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
expect(screen.getByText("CNY 12.00")).toBeInTheDocument();
expect(screen.queryByLabelText(/select entries/i)).not.toBeInTheDocument();
```

Run: `npx vitest run --config vitest.unit.config.ts tests/unit/modules/workspace/ui/DetailsToolbar.test.tsx`

Expected: FAIL because the component still requires selection props.

- [ ] **Step 2: Remove only source-document batch retry/delete**

Delete batch retry and remove the batch branch from `delete-source-document.ts` while retaining `deleteSourceDocument`. Remove `BatchRetrySourceDocumentItemDto`, `BatchRetrySourceDocumentsResultDto`, `BatchDeleteSourceDocumentsResultDto`, and the already-dead `sourceDocumentIdsSchema`. Keep Stream selection, selection props on source-document cards/groups, `batchUpdateSourceDocumentsAction`, its contracts/tests, and `batchUpdateDates` in `useBatchSourceDocumentActions`. Remove only the hook's `batchRetry`/`batchDelete` mutations and task-queue invalidations.

`LedgerEntriesTab` continues passing `batchUpdateDates` to `LedgerEntriesToolbar`. Remove `onRetry`, `onDelete`, `isRetrying`, and `isDeleting` from that toolbar. Narrow `SourceDocumentActions` to the date picker only (or inline that picker into the toolbar), and delete the unused `SourceDocumentBatchActionToolbar` which otherwise leaves callable retry/delete props in a public barrel.

- [ ] **Step 3: Remove ledger-entry selection and batch delete**

Delete only `batchDeleteLedgerEntriesAction` from `server-actions/entries.ts`. Remove selection state and batch toolbar rendering from the top-level `DetailsTab`, where the remaining actions are historical AI categorization and delete. Retain filters, totals, infinite scroll, single-entry view/edit/delete, and the existing entry cards.

Keep selection inside `SourceDocumentDetailModal` because batch category and currency edits remain supported. Remove only its `onBatchDelete` prop, mutation, handler, action button, and copy. Keep `onBatchUpdate`, `batchUpdateLedgerEntriesAction`, `useSelection`, and the category/currency controls in `LedgerEntriesBatchActionToolbar`.

- [ ] **Step 4: Delete retired translation keys and focused tests**

Narrow `BatchActions` copy instead of deleting the namespace. Retain `selected`, select-all, loaded-only, set-date/date-updated/confirm, category, and currency copy used by Stream date updates and source-document detail batch edits. Delete only AI categorization, batch retry, and batch delete copy. Retain single delete/retry copy in the owning non-batch namespaces. Delete only tests whose subject is the retired batch operation; remove batch-only cases from mixed single-operation suites.

- [ ] **Step 5: Run retained lifecycle and UI tests**

Run:

```bash
npx vitest run --config vitest.unit.config.ts tests/unit/modules/workspace/ui/DetailsToolbar.test.tsx tests/unit/modules/source-document/application/use-cases/delete-source-document.test.ts tests/unit/source-document/server-actions/retry.test.ts
npx vitest run --config vitest.integration.config.ts --reporter=dot tests/integration/modules/source-document/application/use-cases/delete-source-document.test.ts tests/integration/modules/source-document/application/use-cases/retry-source-document.test.ts tests/integration/source-document/update-actions.test.ts
npm run tsc
```

Expected: PASS; `rg "batchRetrySourceDocuments|batchDeleteSourceDocuments|batchDeleteLedgerEntries" src` returns no matches, while `batchUpdateSourceDocumentsAction` and its date-update test remain.

- [ ] **Step 6: Commit checkpoint after user authorization**

Suggested message: `refactor: remove retired batch actions`

### Task 4: Make API v1 write-only and remove export

**Files:**

- Delete: `src/app/api/v1/categories/route.ts`
- Delete: `src/app/api/v1/entries/route.ts`
- Delete: `src/app/api/v1/stats/route.ts`
- Modify: `src/app/api/v1/source-documents/route.ts`
- Delete: `src/modules/ledger/application/use-cases/export-ledger-entries.ts`
- Delete: `src/modules/ledger/server-actions/export.ts`
- Delete: `src/modules/ledger/ui/ExportSection.tsx`
- Delete: `tests/integration/ledger-export.test.ts`
- Delete: `tests/unit/ledger/actions-export-boundary.test.ts`
- Delete: `tests/unit/api/v1/ledger-query-routes-omission.test.ts`
- Delete: `tests/integration/api/v1-query-endpoints.test.ts`
- Modify: `src/modules/ledger/actions.ts`
- Modify: `src/modules/ledger/contracts.ts`
- Modify: `src/modules/ledger/ui/SettingsTab.tsx`
- Modify: `tests/unit/api/v1/public-contract-routes.test.ts`
- Modify: `tests/unit/api/v1/source-documents-route-omission.test.ts`
- Modify: `tests/integration/api/source-documents-route.test.ts`
- Modify: `src/lib/env/{runtime,startup}.ts`
- Modify: `tests/unit/lib/env/{runtime,startup}.test.ts`
- Modify: `.env.example`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Rewrite the public-contract test and verify RED**

Assert that only `POST /api/v1/source-documents` remains. The test should check that retired route directories do not exist and that the source-document route source includes `POST` but not `GET`, matching the governance test.

Run: `npx vitest run --config vitest.unit.config.ts tests/unit/api/v1/public-contract-routes.test.ts`

Expected: FAIL while the six GET surfaces remain: categories, entries, stats, task items, task stats, and source documents.

- [ ] **Step 2: Remove public reads without touching authenticated app queries**

Delete the categories, entries, stats, and task API directories. Remove only the `GET` export and its imports from `source-documents/route.ts`; leave the existing `POST` ingestion handler unchanged. Do not delete module-level authenticated server actions used by Stream, Details, Stats, or Settings.

- [ ] **Step 3: Remove export from application and Settings**

Delete the export use case, server action, UI section, exports, tests, and translations. Remove `ExportResult`, `ExportLedgerEntriesOptions`, and read-API-only `CategoriesResponseDto` from `ledger/contracts.ts`. Remove `EXPORT_MAX_ENTRIES` from startup defaults/schema, `RuntimeEnv`, `runtimeEnv`, env tests, and `.env.example`. `SettingsTab` must no longer import or render `ExportSection`.

Delete the read-only API suites listed above. Narrow both source-document route suites to their POST cases; do not delete POST omission/auth/creation coverage.

- [ ] **Step 4: Run focused verification**

Run:

```bash
npx vitest run --config vitest.unit.config.ts tests/unit/api/v1/public-contract-routes.test.ts
npx vitest run --config vitest.unit.config.ts tests/unit/api/v1/source-documents-route-omission.test.ts tests/unit/lib/env/runtime.test.ts tests/unit/lib/env/startup.test.ts
npx vitest run --config vitest.integration.config.ts --reporter=dot tests/integration/api/source-documents-route.test.ts
npm run tsc
```

Expected: PASS; source-document POST coverage remains green and the retired route directories are absent. Built-route 404 behavior is covered later by the production build gate, not claimed by these focused source/filesystem tests.

- [ ] **Step 5: Commit checkpoint after user authorization**

Suggested message: `refactor: retire public reads and export`

### Task 5: Remove retired AI tasks and real-provider smoke infrastructure

**Files:**

- Delete: `src/modules/ledger/application/services/categorize-task-submission.ts`
- Delete: `src/modules/ledger/application/services/category-metadata-task.ts`
- Delete: `src/modules/ledger/application/tasks/categorize-entry.ts`
- Delete: `src/modules/ledger/application/tasks/category-metadata-prompts.ts`
- Delete: `src/modules/ledger/application/tasks/generate-category-metadata.ts`
- Delete: `src/modules/ledger/application/use-cases/submit-categorize-tasks.ts`
- Delete: `src/modules/ledger/server-actions/categorize.ts`
- Delete: `src/modules/ledger/application/queries/list-categorization-target-entries.ts`
- Delete: `src/modules/ledger/application/queries/list-indexed-categories-for-categorization.ts`
- Delete: `src/modules/ledger/hooks/useAutoCategorizeMutation.ts`
- Delete: retired categorization/metadata tests
- Delete: `tests/smoke/parse-pipeline.smoke.test.ts`
- Delete: `tests/smoke/setup.ts`
- Create: `src/persistence/migrations/0034_retire_category_ai_tasks.sql` (via Drizzle custom migration generation)
- Create: `tests/integration/persistence/retire-category-ai-tasks-migration.test.ts`
- Modify: `src/lib/tasks/task-registry.ts`
- Modify: `src/modules/ledger/{actions.ts,tasks.ts}` and hook/task barrels
- Modify: `src/modules/ledger/contracts.ts`
- Modify: `src/modules/ledger/application/use-cases/create-entry-category.ts`
- Modify: `src/modules/ledger/application/use-cases/delete-entry-category.ts`
- Modify: `src/modules/ledger/ui/{SettingsTab,CategorySection}.tsx`
- Modify: `tests/integration/ledger/category-actions.test.ts`
- Modify: `tests/unit/lib/tasks/task-registry.test.ts`
- Modify: `vitest.config.ts`
- Modify: `vitest.shared.config.ts`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Add the retained category-creation behavior and verify RED**

Change the category action test to require immediate ordinary creation with user-provided/default metadata and no task run:

```ts
const category = await createEntryCategory(ledgerId, { name: "Travel" });
expect(category.name).toBe("Travel");
expect(category.icon ?? null).toBeNull();
expect(category.description ?? null).toBeNull();
expect(await db.query.taskRuns.findMany({ where: eq(taskRuns.entityId, category.id) })).toEqual([]);
```

Run: `npx vitest run --config vitest.integration.config.ts --reporter=dot tests/integration/ledger/category-actions.test.ts`

Expected: FAIL because category creation currently submits `generate_category_metadata`.

- [ ] **Step 2: Make category creation synchronous and manual**

Remove `submitCategoryMetadataTaskIfNeeded` and its call from `create-entry-category.ts`. In `CategorySection`, remove `isGenerating`, the spinner, the generating label, the unused auto-categorize prop, and the auto-categorize hook wiring. Render `IconPicker` and the description `EditableField` immediately, allowing null/empty values.

- [ ] **Step 3: Remove both retired AI task families**

Delete the listed services, tasks, queries, use case, hooks, and tests. `registerAllTasks` becomes:

```ts
const { parseSourceDocumentTaskDefinition } = await import("@/modules/source-document/tasks");
registerTaskIfNeeded(
  engine,
  parseSourceDocumentTaskDefinition.type,
  parseSourceDocumentTaskDefinition.handler
);
```

Retain parser-facing category queries such as `listEntryCategoryInfos`; they provide the current category vocabulary to source-document parsing and are not historical auto-categorization.

- [ ] **Step 4: Add a forward data cleanup for nonterminal retired tasks**

Generate a data-only migration with:

```bash
npx drizzle-kit generate --custom --name=retire_category_ai_tasks
```

Put this SQL in the generated `0034_retire_category_ai_tasks.sql`:

```sql
UPDATE `task_runs`
SET
  `status` = 'cancelled',
  `error` = NULL,
  `progress` = NULL,
  `updated_at` = unixepoch() * 1000,
  `completed_at` = COALESCE(`completed_at`, unixepoch() * 1000)
WHERE
  `type` IN ('categorize_entry', 'generate_category_metadata')
  AND `status` IN ('pending', 'running');
```

Write an integration test that creates pending/running/completed retired tasks plus a pending `parse_source_document` task, applies the migration SQL to an isolated SQLite database, and asserts only the two nonterminal retired types become cancelled. Existing migration files remain immutable; historical task names inside them are not live code residue.

- [ ] **Step 5: Remove stale task cleanup, contracts, and copy**

Remove category-task cancellation from `delete-entry-category.ts`, task barrel exports, `CategorizeResult` from `ledger/contracts.ts`, task type labels, settings confirmation copy, and tests that register or submit the two retired task types. Keep `parse_source_document` registry tests.

- [ ] **Step 6: Remove real-provider smoke infrastructure**

Delete `tests/smoke/**`, remove `smokeProjects` and its imports from `vitest.shared.config.ts` and `vitest.config.ts`, and remove the deleted categorize/metadata test paths from `dbUnitFiles`. Retain deterministic parser unit/integration tests with mocked provider boundaries. Remove the smoke command documentation from `CLAUDE.md` in Task 8.

- [ ] **Step 7: Run focused verification**

Run:

```bash
npx vitest run --config vitest.integration.config.ts --reporter=dot tests/integration/ledger/category-actions.test.ts
npx vitest run --config vitest.integration.config.ts --reporter=dot tests/integration/persistence/retire-category-ai-tasks-migration.test.ts
npx vitest run --config vitest.unit.config.ts tests/unit/lib/tasks/task-registry.test.ts tests/unit/ledger/application/queries/list-entry-categories.test.ts
npm run tsc
```

Expected: PASS; live source and messages have no retired AI task references. Matches in immutable migration history and the new cleanup migration are expected and explicitly excluded from zero-match scans.

- [ ] **Step 8: Commit checkpoint after user authorization**

Suggested message: `refactor: remove retired category ai tasks`

### Task 6: Remove image crop/draw and retired account mutations

**Files:**

- Delete: `src/components/ui/image-editor*.ts*`
- Modify: `src/modules/source-document/ui/SourceDocumentImageModal.tsx`
- Modify: `src/modules/source-document/ui/{SourceDocumentInputView,SourceDocumentViewDetails}.tsx`
- Modify: `src/modules/source-document/ui/{SourceDocumentDetailModal,SourceDocumentDetailWrapper}.tsx`
- Modify: `src/modules/source-document/hooks/{useSourceDocumentDetailMutations,useSourceDocumentRecordMutations}.ts`
- Modify: `src/modules/source-document/{actions.ts,contract-schemas.ts}`
- Modify: `src/modules/source-document/server-actions/update.ts`
- Modify: `src/modules/source-document/application/use-cases/update-source-document.ts`
- Delete: image-update-only test cases from source-document update suites
- Delete: `src/modules/auth/application/use-cases/{change-email,clear-user-data,delete-account}.ts`
- Delete: `src/modules/auth/server-actions/{change-email,clear-user-data,delete-account}.ts`
- Delete: `src/modules/auth/ui/{ChangeEmailForm,ClearDataForm,DeleteAccountForm}.tsx`
- Delete: `src/modules/ledger/ui/settings/SettingsDangerActions.tsx`
- Delete: matching auth tests
- Modify: `src/modules/auth/{actions.ts,ui/index.ts}`
- Modify: `src/modules/ledger/ui/SettingsTab.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`
- Test: `tests/unit/modules/ledger/ui/settings-tab-auth.test.tsx`
- Test: `tests/unit/modules/ledger/ui/settings-tab-layout.test.tsx`

- [ ] **Step 1: Rewrite Settings tests to the retained account surface and verify RED**

Require the current email and sign-out command, and require the retired commands to be absent:

```tsx
expect(screen.getByText("person@example.com")).toBeInTheDocument();
expect(screen.getByRole("button", { name: /sign out|退出登录/i })).toBeInTheDocument();
expect(screen.queryByRole("button", { name: /change email|修改邮箱/i })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: /clear data|清空数据/i })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: /delete account|删除账户/i })).not.toBeInTheDocument();
```

Run: `npx vitest run --config vitest.unit.config.ts tests/unit/modules/ledger/ui/settings-tab-auth.test.tsx tests/unit/modules/ledger/ui/settings-tab-layout.test.tsx`

Expected: FAIL while Settings renders all three retired mutations.

- [ ] **Step 2: Reduce Account settings without changing OTP auth**

Delete the mutation/use-case/form files and their tests/exports. Replace the account block with a read-only email field and the existing sign-out button:

```tsx
<SettingsField title={ta("emailSection")} description={session?.user?.email ?? ""}>
  <span className="text-sm text-muted-foreground">{session?.user?.email ?? ""}</span>
</SettingsField>
```

Do not change OTP issuance, registration policy, Auth.js callbacks, or `DISABLE_REGISTRATION`.

- [ ] **Step 3: Convert the image modal to preview-only**

Delete editor imports/state/actions and narrow its props to:

```ts
interface SourceDocumentImageModalProps {
  images: SourceDocumentModalImage[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

Keep close, previous/next, and thumbnail navigation. Remove `editable` and `onSave` from all callers. Remove the now-dead `onUpdateImages` prop chain, `updateSourceDocumentImagesAction`, its mutation/use-case branch, its input schema if unused, and image-update-only tests. Input/retry flows still add and remove images through `SourceDocumentInput`; viewing a stored source document no longer offers crop/draw editing or in-place image replacement.

- [ ] **Step 4: Delete editor code, dependency, and copy**

Run `npm uninstall react-image-crop` to update both manifest and lockfile. Delete the `ImageEditor` translation namespace and edit/pending-tool copy that has no retained caller. Keep source-document image preview labels.

- [ ] **Step 5: Run focused verification**

Run:

```bash
npx vitest run --config vitest.unit.config.ts tests/unit/modules/ledger/ui/settings-tab-auth.test.tsx tests/unit/modules/ledger/ui/settings-tab-layout.test.tsx
npm run validate:i18n
npm run tsc
```

Expected: PASS; `rg "ImageEditor|react-image-crop|ChangeEmailForm|clearUserData|deleteAccount" src package.json messages` returns no matches. OTP login's `handleChangeEmail` navigation and its copy are retained and must not be treated as the deleted account mutation.

- [ ] **Step 6: Commit checkpoint after user authorization**

Suggested message: `refactor: remove retired editors and account actions`

### Task 7: Reduce PWA behavior to static precaching

**Files:**

- Create: `tests/unit/governance/pwa-policy.test.ts`
- Modify: `next.config.ts`
- Delete: `public/push-worker.js`
- Preserve: `src/app/manifest.ts`
- Preserve: install icons under `public/` and `src/app/`
- Preserve: `@ducanh2912/next-pwa`

- [ ] **Step 1: Write the focused PWA policy test and verify RED**

```ts
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("PWA policy", () => {
  it("keeps installation but removes navigation, runtime-data, and push behavior", () => {
    const config = read("next.config.ts");
    expect(config).toContain("cacheOnFrontEndNav: false");
    expect(config).toContain("aggressiveFrontEndNavCaching: false");
    expect(config).toContain("cacheStartUrl: false");
    expect(config).toContain("dynamicStartUrl: false");
    expect(config).toContain("runtimeCaching: []");
    expect(config).not.toContain("importScripts");
    expect(existsSync(resolve(root, "public/push-worker.js"))).toBe(false);
    expect(existsSync(resolve(root, "src/app/manifest.ts"))).toBe(true);
  });
});
```

Run: `npx vitest run --config vitest.unit.config.ts tests/unit/governance/pwa-policy.test.ts`

Expected: FAIL because navigation caching is enabled, no explicit empty runtime cache exists, and `push-worker.js` is imported/present.

- [ ] **Step 2: Narrow Next PWA configuration**

Use this PWA policy:

```ts
const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  cacheStartUrl: false,
  dynamicStartUrl: false,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [],
  },
});
```

`cacheStartUrl: false` and `dynamicStartUrl: false` prevent the plugin's default `NetworkFirst` start-URL route. An empty `runtimeCaching` list prevents API, RSC, authenticated navigation, and protected image runtime caches. The plugin may still precache build-hashed static assets, which is the retained PWA behavior.

- [ ] **Step 3: Remove Push Worker code**

Delete `public/push-worker.js` and `importScripts`. Do not add notification permissions, push subscriptions, or a replacement worker.

- [ ] **Step 4: Verify config and generated output**

Run:

```bash
npx vitest run --config vitest.unit.config.ts tests/unit/governance/pwa-policy.test.ts
npm run build
if rg -n "push-worker|notificationclick|/api/|_rsc|NetworkFirst|NavigationRoute|start-url|StaleWhileRevalidate" next.config.ts public/sw.js; then
  echo "Forbidden PWA runtime behavior found" >&2
  exit 1
fi
```

Expected: test and build PASS. There are no push-worker/notification handlers and no configured runtime-data cache strategies; hashed build assets remain precached.

- [ ] **Step 5: Commit checkpoint after user authorization**

Suggested message: `refactor: narrow pwa caching policy`

### Task 8: Remove the Docker production path and complete cleanup

**Files:**

- Delete: `.dockerignore`
- Delete: `Dockerfile`
- Delete: `docker-compose.yml`
- Delete: `docker-entrypoint.sh`
- Modify: `.github/workflows/ci-cd.yml`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/runbook.md`
- Modify: `CLAUDE.md`
- Modify: `.env.example`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`
- Test: `tests/unit/governance/retired-features.test.ts`

- [ ] **Step 1: Remove deployment artifacts and commands**

Delete the four Docker files and `docker:build`, `docker:prod`, and `docker:down` scripts. Retain `dev`, `build`, `start`, database, and verification scripts because local Node/SQLite operation remains supported during this phase.

- [ ] **Step 2: Reduce GitHub Actions to CI**

Keep the existing checkout, Node setup, `npm ci`, lint, typecheck, tests, and i18n steps. Delete the complete `build-and-push` job, GHCR permissions, Docker Buildx/login/metadata/build actions, and the misleading comment that image publication may proceed when tests fail. Rename the workflow from `CI/CD` to `CI`.

- [ ] **Step 3: Update active documentation and environment labels**

Remove Docker sections/commands from `README.md`, `docs/runbook.md`, and `CLAUDE.md`. In `CLAUDE.md`, also remove smoke-test instructions, the `task-queue` product module, obsolete `src/lib/flow` paths, and category-generation task guidance; document only the temporarily retained internal `parse_source_document` runtime under `src/lib/tasks`. Rename `.env.example`'s `Task Queue` heading to `Task Runtime`, retain `MAX_TASK_WORKER`, and remove the export limit block. Keep local startup, SQLite migration, local data backup, worktree notes, and Node build/start instructions. Do not document Vercel, Neon, R2, or Queues yet; those are not implemented in this phase.

- [ ] **Step 4: Clean translations and dead imports**

Run the i18n validator, TypeScript, and ESLint. Remove only unreferenced retired feature keys/imports/files revealed by those checks. Do not perform unrelated formatting or component refactors.

- [ ] **Step 5: Verify the governance test has reached GREEN**

Run: `npx vitest run --config vitest.unit.config.ts tests/unit/governance/retired-features.test.ts`

Expected: PASS, including the assertions that current local infrastructure remains present.

- [ ] **Step 6: Run the full repository gate**

Run:

```bash
npm run lint
npm run tsc
npm run test:unit
npm run test:integration
npm run test:coverage
npm run build
npm run validate:i18n
```

Expected: every command exits 0. If an existing test asserts a retired behavior, delete or narrow that test; if it covers a retained behavior, fix the implementation rather than deleting the test.

- [ ] **Step 7: Perform residue scans**

Run:

```bash
rg -n "TaskQueue|batchRetrySourceDocuments|batchDeleteSourceDocuments|batchDeleteLedgerEntries|exportLedgerEntries|CategorizeResult|ImageEditor|react-image-crop|ChangeEmailForm|ClearDataForm|DeleteAccountForm|clearUserData|deleteAccount|push-worker|notificationclick|docker compose|ghcr.io/xiangyu-labs/cashier" src tests messages package.json README.md docs/runbook.md CLAUDE.md .github --glob '!src/persistence/migrations/**'
rg -n "categorize_entry|generate_category_metadata" src tests messages --glob '!src/persistence/migrations/**' --glob '!tests/integration/persistence/retire-category-ai-tasks-migration.test.ts'
rg -n "batchUpdateSourceDocumentsAction|parse_source_document|src/lib/tasks|src/lib/storage/local|better-sqlite3|manifest.webmanifest" src package.json
git status --short
```

Expected: the retirement scans contain only intentional negative governance assertions, not callable production boundaries. Historical task names remain only in immutable migrations, the new cleanup migration, and its test. The retained-boundary scan proves Stream batch date updates, parser runtime, local storage/SQLite, and PWA installation have not been prematurely removed; status contains only planned changes.

- [ ] **Step 8: Commit checkpoint after user authorization**

Suggested message: `refactor: remove retired product features`

## Final Acceptance

- The app still logs in with email OTP and can sign out.
- Stream can create text/image source documents, display processing state, and use single retry/edit retry/manual entry/delete.
- Stream selection can still batch-update source-document dates, but cannot batch retry/delete.
- Details can view/edit/delete individual entries and save source-document entry sets.
- Stats and Settings still use authenticated application queries.
- Categories remain manually editable, but creating one launches no AI task.
- API v1 accepts source-document writes and exposes no reads.
- Images can be uploaded, removed, previewed, and navigated, but not cropped/drawn.
- PWA installation and hashed static precaching remain; navigation, API/RSC/authenticated data, protected images, and push behavior are not cached.
- No standalone task center, task cancel/dismiss, batch retry/delete, export, historical auto-categorization, retired account action, or Docker production path remains.
- Current SQLite/local-storage/in-process parsing behavior remains operational for the infrastructure migration phase.
