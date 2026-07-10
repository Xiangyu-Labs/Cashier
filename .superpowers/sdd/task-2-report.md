# Task 2: Remove Task Center and Public Task Management

## What Was Implemented

Removed the standalone task center UI, its task list/stats APIs, user-triggered cancel/dismiss task actions, the `src/modules/task-queue/` module entirely, and the processing-task read models.

## TDD Evidence

### RED (Step 1)
- Wrote updated Header test expecting `onOpenInput` only, no task center button
- Test failed with: `TypeError: Cannot read properties of undefined (reading 'total')` because `pendingStats` was required by the old Header

### GREEN (Steps 2-4)
- Header test passes after collapsing Header/AppShell to `{ onOpenInput }` contract
- All focused unit tests pass

## Test Results

- `tests/unit/modules/workspace/ui/Header.test.tsx` - PASS (1 test)
- `tests/unit/lib/query-keys.test.ts` - PASS (32 tests)
- `tests/unit/api/v1/public-contract-routes.test.ts` - PASS (1 test)
- `tests/integration/api/v1-query-endpoints.test.ts` - PASS (18 tests, after removing task API tests)
- TypeScript (`tsc --noEmit`) - PASS (no errors)

The governance test (`retired-features.test.ts`) fails on Task 1 retired items not yet applied to this worktree (Docker files, image-editor, etc.) - these failures are expected and unrelated to this task.

## Files Changed

### Deleted (source)
- `src/modules/task-queue/` - entire module (33 files)
- `src/app/api/v1/task/items/route.ts`
- `src/app/api/v1/task/stats/route.ts`
- `src/app/api/v1/task/` - entire directory (now cleanly removed)
- `src/modules/source-document/server-actions/processing.ts`
- `src/modules/source-document/application/queries/source-document-processing.ts`

### Modified (source)
- `src/modules/workspace/ui/Header.tsx` - Simplified to `{ onOpenInput }` contract, removed task-queue rendering, TaskQueue translation usage
- `src/modules/workspace/ui/AppShell.tsx` - Simplified to `{ onOpenInput, children }` contract
- `src/modules/workspace/ui/LedgerPageClient.tsx` - Removed `useTaskQueue`, `TaskQueueModal`, `pendingStats`, `isPendingOpen`
- `src/modules/workspace/ui/useLedgerDialogState.ts` - Removed `isPendingOpen`/`setIsPendingOpen`
- `src/lib/query-keys.ts` - Removed `queryKeys.taskQueue`, `queryKeys.processingTasks`, `invalidateTaskQueue`
- `src/lib/mutations/use-ledger-mutation.ts` - Removed `invalidateTaskQueue` from default predicates
- `src/modules/ledger/hooks/useBatchEntryActions.ts` - Removed `invalidateTaskQueue`
- `src/modules/ledger/hooks/useCategoryMutations.ts` - Removed `invalidateTaskQueue` imports/usages
- `src/modules/ledger/hooks/useAutoCategorizeMutation.ts` - Removed `queryKeys.taskQueue` reference
- `src/modules/source-document/actions.ts` - Removed `getProcessingTasksAction`/`getProcessingStatsAction` exports
- `src/modules/source-document/contracts.ts` - Removed `ProcessingTaskStatusDto`, `ProcessingTaskDto`, `ProcessingStatsDto`
- `src/modules/source-document/contract-schemas.ts` - Removed `processingTasksQuerySchema`, `ProcessingTasksQueryInput`
- `src/modules/source-document/ui/processing-status.tsx` - Changed from `useTranslations("TaskQueue")` to `useTranslations("SourceDocumentCard")`, updated key names
- `src/modules/source-document/hooks/useSourceDocumentSubmitMutations.ts` - Removed `invalidateTaskQueue` imports/usages
- `src/modules/source-document/hooks/useBatchSourceDocumentActions.ts` - Removed `invalidateTaskQueue` imports/usages
- `src/modules/workspace/ui/LedgerEntriesTab.tsx` - Removed `invalidateTaskQueue` usage
- `src/modules/workspace/ui/DetailsTab.tsx` - Removed `invalidateTaskQueue` usage
- `src/modules/workspace/ui/StatsTab.tsx` - Removed `invalidateTaskQueue` usage
- `messages/en.json` - Removed `TaskQueue` block, added `queued`/`processing`/`completed` to `SourceDocumentCard`
- `messages/zh.json` - Same as above

### Deleted (tests)
- `tests/integration/modules/task-queue/` (3 files)
- `tests/integration/task-queue/` (4 files)
- `tests/unit/modules/task-queue/` (1 file)
- `tests/unit/task-queue/` (1 file)
- `tests/integration/tasks/dismiss-task-actions.test.ts`
- `tests/integration/api/processing-stats.test.ts`
- `tests/integration/api/processing-tasks.test.ts`
- `tests/integration/processing-tasks.test.ts`
- `tests/unit/modules/source-document/application/queries/source-document-processing.test.ts`

### Modified (tests)
- `tests/unit/modules/workspace/ui/Header.test.tsx` - Rewritten to test new contract
- `tests/unit/lib/query-keys.test.ts` - Removed task-queue key/invalidation tests
- `tests/unit/api/v1/public-contract-routes.test.ts` - Removed task API route tests
- `tests/integration/api/v1-query-endpoints.test.ts` - Removed task API section

## Preserved Per Requirements
- `src/lib/tasks/**` - Internal task runtime preserved
- `src/persistence/schema/task-queue.ts` - DB schema preserved
- `src/lib/tasks/runtime.ts` and `index.ts` - `cancelTask` export preserved
- `src/modules/source-document/application/services/source-document-lifecycle.ts` - Internal `cancelTask` calls preserved
- `src/modules/ledger/application/use-cases/delete-entry-category.ts` - Internal `cancelTask` calls preserved
- `src/modules/source-document/application/tasks/parse-source-document.ts` - Task handler preserved

## Self-Review Findings

1. The `useCategoryMutations.ts` had an empty `onSettledExtra` handler after removing the `invalidateTaskQueue` call - cleaned up during the process.
2. The `actions.ts` still exported the deleted `processing.ts` server actions - caught by `tsc` and fixed.
3. All unit test assertions referencing `queryKeys.taskQueue` were removed from the query-keys test.
4. No remaining imports from `@/modules/task-queue` anywhere in the codebase.

## Concerns

None. All planned changes completed cleanly.
