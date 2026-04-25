# TaskQueueModal Hook Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/modules/task-queue/ui/useTaskQueueModal.ts` into focused, testable local modules so task-queue modal interactions can keep evolving without re-concentrating state and orchestration in one hook.

**Architecture:** Keep `useTaskQueueModal` as the single composition boundary for `TaskQueueModal`, but move pure queue derivation into a local selector module, modal-local UI state into dedicated hooks, and mutation/navigation orchestration into a dedicated actions hook. Preserve the current user-visible behavior and existing query invalidation semantics; do not introduce a generic reducer, state machine, or reusable modal framework.

**Tech Stack:** React 19, TypeScript, TanStack Query, next-intl, Zustand, Vitest, Testing Library

---

## Scope Check

This plan is intentionally scoped to one hotspot and its direct consumers:

- `src/modules/task-queue/ui/useTaskQueueModal.ts`
- `src/modules/task-queue/ui/TaskQueueModal.tsx`
- `src/modules/task-queue/ui/TaskQueueDialogs.tsx`

It does **not** refactor:

- `src/modules/task-queue/ui/useTaskQueueMutations.ts` and the lower-level mutation hooks
- `src/modules/task-queue/ui/TaskQueueContent.tsx` beyond wiring a clearer callback that already fits its prop shape
- `QueueItemCard` behavior or any server-side task queue logic

That keeps the work shippable as one focused refactor PR instead of turning into a broader task-queue rewrite.

## File Map

- `src/modules/task-queue/ui/useTaskQueueModal.ts`
  - Final composition hook. Owns `useTaskQueue(ledgerId)`, composes selectors/state/actions, and exposes the modal-facing contract.
- `src/modules/task-queue/ui/taskQueueModal.types.ts`
  - New local types/constants for grouped items, delete-confirm state, retry-status unions, and initial collapsed-state defaults.
- `src/modules/task-queue/ui/taskQueueModal.selectors.ts`
  - New pure helper module for grouping queue items, partitioning failed items, collecting source-document/task ids, and computing empty-state semantics.
- `src/modules/task-queue/ui/useTaskQueueSectionState.ts`
  - New hook that owns only the section collapse state for `pending`, `running`, `failed`, `anomaly`, and `completed`.
- `src/modules/task-queue/ui/useTaskQueueDialogState.ts`
  - New hook for retry-dialog state and delete-confirm state, including semantic open/close helpers instead of exposing raw `setState` everywhere.
- `src/modules/task-queue/ui/useTaskQueueModalActions.ts`
  - New hook that owns delete/retry/cancel/dismiss/view-details/retry-success orchestration using the extracted selectors and state helpers.
- `src/modules/task-queue/ui/TaskQueueModal.tsx`
  - Consumer cleanup. Stops reaching into raw mutation objects or raw dialog setters and uses semantic handlers returned by `useTaskQueueModal`.
- `src/modules/task-queue/ui/TaskQueueDialogs.tsx`
  - Dialog wiring cleanup. Accepts semantic close callbacks instead of generic state setters.
- `tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts`
  - Slim composition-contract test for the public hook surface after extraction.
- `tests/unit/modules/task-queue/ui/taskQueueModal.selectors.test.ts`
  - New unit tests for pure grouping/partition/id-collection helpers.
- `tests/unit/modules/task-queue/ui/useTaskQueueSectionState.test.ts`
  - New unit tests for collapse-state defaults and section toggles.
- `tests/unit/modules/task-queue/ui/useTaskQueueDialogState.test.ts`
  - New unit tests for retry/delete dialog state transitions.
- `tests/unit/modules/task-queue/ui/useTaskQueueModalActions.test.ts`
  - New unit tests for interaction orchestration and side effects.

## Design Constraints

- Preserve current user-visible behavior in `TaskQueueModal`.
- Keep the refactor local to `src/modules/task-queue/ui/`.
- Prefer semantic handlers over returning raw mutation objects or raw dialog setters.
- Do not create a generic queue controller, modal framework, or reusable reducer.
- Keep pure derivation in pure files so grouping and id-selection logic can be tested without React.
- Keep `useTaskQueueModal` as a thin composer after the refactor; no new business logic should accumulate back into it.

### Task 1: Lock The Semantic Hook Surface Before Extraction

**Files:**
- Modify: `src/modules/task-queue/ui/useTaskQueueModal.ts`
- Modify: `tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts`

- [ ] **Step 1: Write the failing hook-contract tests for semantic close helpers and anomaly delete**

Extend `tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts` so the refactor is driven by the API you want to keep after the split.

Add an anomaly fixture to the mocked queue data, for example:

```ts
createItem({
  id: "anomaly-1",
  kind: "anomaly",
  status: "anomaly",
  sourceDocumentId: "doc-anomaly-1",
})
```

Add tests like:

```ts
it("closes retry and delete dialogs through semantic helpers", () => {
  const { result } = renderHook(() => useTaskQueueModal("ledger-1"));

  act(() => {
    result.current.handleRetry(
      createItem({
        id: "failed-with-doc",
        status: "failed",
        sourceDocumentId: "doc-1",
      })
    );
    result.current.handleDeleteAll();
  });

  expect(result.current.retrySourceDocId).toBe("doc-1");
  expect(result.current.deleteConfirm.open).toBe(true);

  act(() => {
    result.current.closeRetryDialog();
    result.current.closeDeleteConfirm();
  });

  expect(result.current.retrySourceDocId).toBeNull();
  expect(result.current.deleteConfirm.open).toBe(false);
});

it("deletes anomaly source documents through a dedicated handler", () => {
  const { result } = renderHook(() => useTaskQueueModal("ledger-1"));

  act(() => {
    result.current.handleDeleteAllAnomaly();
  });

  expect(batchDeleteMutateMock).toHaveBeenCalledWith(["doc-anomaly-1"]);
});
```

- [ ] **Step 2: Run the hook test to verify it fails**

Run: `npm run test:unit -- tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts`
Expected: FAIL because `closeRetryDialog`, `closeDeleteConfirm`, and `handleDeleteAllAnomaly` do not exist yet.

- [ ] **Step 3: Add the smallest inline implementation in `useTaskQueueModal.ts`**

Add semantic wrappers before any extraction:

```ts
const closeRetryDialog = useCallback(() => {
  setRetrySourceDocId(null);
}, []);

const closeDeleteConfirm = useCallback(() => {
  setDeleteConfirm((previous) => ({ ...previous, open: false }));
}, []);

const handleDeleteAllAnomaly = useCallback(() => {
  const ids = groupedItems.anomaly
    .map((item) => item.sourceDocumentId)
    .filter((id): id is string => id != null && id !== "");

  if (ids.length > 0) {
    batchDelete.mutate(ids);
  }
}, [groupedItems.anomaly, batchDelete]);
```

Expose those handlers from `UseTaskQueueModalReturn`, but keep the existing inline logic for now. This step is only about locking the target contract before the real extraction work starts.

- [ ] **Step 4: Re-run the hook test**

Run: `npm run test:unit -- tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/task-queue/ui/useTaskQueueModal.ts \
  tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts
git commit -m "test: lock task queue modal semantic contract"
```

### Task 2: Extract Modal-Local Types And Pure Selectors

**Files:**
- Create: `src/modules/task-queue/ui/taskQueueModal.types.ts`
- Create: `src/modules/task-queue/ui/taskQueueModal.selectors.ts`
- Modify: `src/modules/task-queue/ui/useTaskQueueModal.ts`
- Create: `tests/unit/modules/task-queue/ui/taskQueueModal.selectors.test.ts`
- Test: `tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts`

- [ ] **Step 1: Write the failing pure-selector tests**

Create `tests/unit/modules/task-queue/ui/taskQueueModal.selectors.test.ts` with direct coverage of the data derivation currently buried inside the hook.

Add tests like:

```ts
import {
  collectSourceDocumentIds,
  collectTaskIds,
  groupTaskQueueItems,
  isTaskQueueEmpty,
  partitionFailedItems,
} from "@/modules/task-queue/ui/taskQueueModal.selectors";

it("groups queue items by status and partitions failed items by source-document linkage", () => {
  const grouped = groupTaskQueueItems([
    createItem({ id: "pending-1", status: "pending" }),
    createItem({ id: "failed-doc", status: "failed", sourceDocumentId: "doc-1" }),
    createItem({ id: "failed-no-doc", status: "failed" }),
    createItem({ id: "anomaly-1", kind: "anomaly", status: "anomaly", sourceDocumentId: "doc-2" }),
  ]);

  expect(grouped.pending.map((item) => item.id)).toEqual(["pending-1"]);
  expect(grouped.failed.map((item) => item.id)).toEqual(["failed-doc", "failed-no-doc"]);
  expect(grouped.anomaly.map((item) => item.id)).toEqual(["anomaly-1"]);

  const partition = partitionFailedItems(grouped.failed);
  expect(partition.withSourceDoc.map((item) => item.id)).toEqual(["failed-doc"]);
  expect(partition.withoutSourceDoc.map((item) => item.id)).toEqual(["failed-no-doc"]);
});

it("collects only non-empty source-document and task ids", () => {
  expect(
    collectSourceDocumentIds([
      createItem({ sourceDocumentId: "doc-1" }),
      createItem({ sourceDocumentId: "" }),
      createItem({ sourceDocumentId: null }),
    ])
  ).toEqual(["doc-1"]);

  expect(
    collectTaskIds([
      createItem({ taskId: "task-1" }),
      createItem({ taskId: "" }),
      createItem({ taskId: undefined }),
    ])
  ).toEqual(["task-1"]);
});
```

- [ ] **Step 2: Run the new selector test to verify it fails**

Run: `npm run test:unit -- tests/unit/modules/task-queue/ui/taskQueueModal.selectors.test.ts`
Expected: FAIL because `taskQueueModal.selectors.ts` does not exist yet.

- [ ] **Step 3: Create `taskQueueModal.types.ts` and `taskQueueModal.selectors.ts`**

Add modal-local shared types/constants:

```ts
// taskQueueModal.types.ts
import type { QueueItem } from "@/modules/task-queue/contracts";

export interface TaskQueueGroupedItems {
  pending: QueueItem[];
  running: QueueItem[];
  failed: QueueItem[];
  completed: QueueItem[];
  anomaly: QueueItem[];
}

export interface TaskQueueDeleteConfirmState {
  open: boolean;
  type: "single" | "all" | null;
  id: string | null;
  title: string;
  description: string;
}

export type TaskQueueRetryStatus = "failed" | "anomaly";

export const INITIAL_TASK_QUEUE_COLLAPSED_STATE = {
  pending: false,
  running: false,
  failed: false,
  anomaly: false,
  completed: true,
} as const;

export const EMPTY_TASK_QUEUE_DELETE_CONFIRM: TaskQueueDeleteConfirmState = {
  open: false,
  type: null,
  id: null,
  title: "",
  description: "",
};
```

Add pure selectors:

```ts
// taskQueueModal.selectors.ts
import type { QueueItem, TaskQueueStats } from "@/modules/task-queue/contracts";
import type { TaskQueueGroupedItems } from "./taskQueueModal.types";

function isNonEmptyId(value: string | null | undefined): value is string {
  return typeof value === "string" && value !== "";
}

export function groupTaskQueueItems(items: QueueItem[]): TaskQueueGroupedItems { ... }

export function partitionFailedItems(items: QueueItem[]) {
  return {
    withSourceDoc: items.filter((item) => isNonEmptyId(item.sourceDocumentId)),
    withoutSourceDoc: items.filter((item) => !isNonEmptyId(item.sourceDocumentId)),
  };
}

export function collectSourceDocumentIds(items: QueueItem[]): string[] {
  return items.map((item) => item.sourceDocumentId).filter(isNonEmptyId);
}

export function collectTaskIds(items: QueueItem[]): string[] {
  return items.map((item) => item.taskId).filter(isNonEmptyId);
}

export function isTaskQueueEmpty(stats: TaskQueueStats, groupedItems: TaskQueueGroupedItems) {
  return stats.total === 0 && groupedItems.completed.length === 0;
}
```

- [ ] **Step 4: Switch `useTaskQueueModal.ts` to the new selectors**

Replace the inline `useMemo` grouping block and the repeated failed-item filters with:

```ts
const groupedItems = useMemo(() => groupTaskQueueItems(items), [items]);
const { withSourceDoc: failedWithSourceDoc, withoutSourceDoc: failedWithoutSourceDoc } =
  useMemo(() => partitionFailedItems(groupedItems.failed), [groupedItems.failed]);
const isEmpty = isTaskQueueEmpty(stats, groupedItems);
```

At this stage, the hook should still behave the same, just with pure derivation moved into a dedicated module.

- [ ] **Step 5: Re-run selector and hook tests**

Run: `npm run test:unit -- tests/unit/modules/task-queue/ui/taskQueueModal.selectors.test.ts tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/task-queue/ui/taskQueueModal.types.ts \
  src/modules/task-queue/ui/taskQueueModal.selectors.ts \
  src/modules/task-queue/ui/useTaskQueueModal.ts \
  tests/unit/modules/task-queue/ui/taskQueueModal.selectors.test.ts \
  tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts
git commit -m "refactor: extract task queue modal selectors"
```

### Task 3: Extract Section State And Dialog State Hooks

**Files:**
- Create: `src/modules/task-queue/ui/useTaskQueueSectionState.ts`
- Create: `src/modules/task-queue/ui/useTaskQueueDialogState.ts`
- Modify: `src/modules/task-queue/ui/useTaskQueueModal.ts`
- Create: `tests/unit/modules/task-queue/ui/useTaskQueueSectionState.test.ts`
- Create: `tests/unit/modules/task-queue/ui/useTaskQueueDialogState.test.ts`
- Test: `tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts`

- [ ] **Step 1: Write the failing state-hook tests**

Create focused unit tests for the two state-heavy responsibilities currently living inline.

For section state:

```ts
it("starts with completed collapsed and updates each section independently", () => {
  const { result } = renderHook(() => useTaskQueueSectionState());

  expect(result.current.isPendingCollapsed).toBe(false);
  expect(result.current.isCompletedCollapsed).toBe(true);

  act(() => {
    result.current.setIsPendingCollapsed(true);
    result.current.setIsCompletedCollapsed(false);
    result.current.setIsAnomalyCollapsed(true);
  });

  expect(result.current.isPendingCollapsed).toBe(true);
  expect(result.current.isCompletedCollapsed).toBe(false);
  expect(result.current.isAnomalyCollapsed).toBe(true);
});
```

For dialog state:

```ts
it("opens and closes delete confirms without clearing the payload", () => {
  const { result } = renderHook(() => useTaskQueueDialogState());

  act(() => {
    result.current.openSingleDeleteConfirm("doc-1", "Delete", "Confirm?");
  });

  expect(result.current.deleteConfirm).toEqual({
    open: true,
    type: "single",
    id: "doc-1",
    title: "Delete",
    description: "Confirm?",
  });

  act(() => {
    result.current.closeDeleteConfirm();
  });

  expect(result.current.deleteConfirm.open).toBe(false);
  expect(result.current.deleteConfirm.id).toBe("doc-1");
});
```

- [ ] **Step 2: Run the state-hook tests to verify they fail**

Run: `npm run test:unit -- tests/unit/modules/task-queue/ui/useTaskQueueSectionState.test.ts tests/unit/modules/task-queue/ui/useTaskQueueDialogState.test.ts`
Expected: FAIL because the new hooks do not exist yet.

- [ ] **Step 3: Implement the new hooks and swap `useTaskQueueModal.ts` to use them**

Implement section state:

```ts
// useTaskQueueSectionState.ts
import { useCallback, useState } from "react";
import { INITIAL_TASK_QUEUE_COLLAPSED_STATE } from "./taskQueueModal.types";

export function useTaskQueueSectionState() {
  const [collapsedSections, setCollapsedSections] = useState(INITIAL_TASK_QUEUE_COLLAPSED_STATE);

  const setSectionCollapsed = useCallback(
    (section: keyof typeof INITIAL_TASK_QUEUE_COLLAPSED_STATE, value: boolean) => {
      setCollapsedSections((previous) => ({ ...previous, [section]: value }));
    },
    []
  );

  return {
    isPendingCollapsed: collapsedSections.pending,
    isRunningCollapsed: collapsedSections.running,
    isFailedCollapsed: collapsedSections.failed,
    isAnomalyCollapsed: collapsedSections.anomaly,
    isCompletedCollapsed: collapsedSections.completed,
    setIsPendingCollapsed: (value: boolean) => setSectionCollapsed("pending", value),
    setIsRunningCollapsed: (value: boolean) => setSectionCollapsed("running", value),
    setIsFailedCollapsed: (value: boolean) => setSectionCollapsed("failed", value),
    setIsAnomalyCollapsed: (value: boolean) => setSectionCollapsed("anomaly", value),
    setIsCompletedCollapsed: (value: boolean) => setSectionCollapsed("completed", value),
  };
}
```

Implement dialog state:

```ts
// useTaskQueueDialogState.ts
import { useCallback, useState } from "react";
import {
  EMPTY_TASK_QUEUE_DELETE_CONFIRM,
  type TaskQueueDeleteConfirmState,
} from "./taskQueueModal.types";

export function useTaskQueueDialogState() {
  const [retrySourceDocId, setRetrySourceDocId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] =
    useState<TaskQueueDeleteConfirmState>(EMPTY_TASK_QUEUE_DELETE_CONFIRM);

  const openSingleDeleteConfirm = useCallback((id: string, title: string, description: string) => {
    setDeleteConfirm({ open: true, type: "single", id, title, description });
  }, []);

  const openDeleteAllConfirm = useCallback((title: string, description: string) => {
    setDeleteConfirm({ open: true, type: "all", id: null, title, description });
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirm((previous) => ({ ...previous, open: false }));
  }, []);

  const closeRetryDialog = useCallback(() => {
    setRetrySourceDocId(null);
  }, []);

  return {
    retrySourceDocId,
    deleteConfirm,
    setRetrySourceDocId,
    openSingleDeleteConfirm,
    openDeleteAllConfirm,
    closeDeleteConfirm,
    closeRetryDialog,
  };
}
```

Then replace the inline `useState` blocks in `useTaskQueueModal.ts` with these hooks.

- [ ] **Step 4: Re-run the new hook tests and the composer hook test**

Run: `npm run test:unit -- tests/unit/modules/task-queue/ui/useTaskQueueSectionState.test.ts tests/unit/modules/task-queue/ui/useTaskQueueDialogState.test.ts tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/task-queue/ui/useTaskQueueSectionState.ts \
  src/modules/task-queue/ui/useTaskQueueDialogState.ts \
  src/modules/task-queue/ui/useTaskQueueModal.ts \
  tests/unit/modules/task-queue/ui/useTaskQueueSectionState.test.ts \
  tests/unit/modules/task-queue/ui/useTaskQueueDialogState.test.ts \
  tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts
git commit -m "refactor: extract task queue modal state hooks"
```

### Task 4: Extract Retry/Cancel/Delete/Dismiss/View-Details Orchestration

**Files:**
- Create: `src/modules/task-queue/ui/useTaskQueueModalActions.ts`
- Modify: `src/modules/task-queue/ui/useTaskQueueModal.ts`
- Create: `tests/unit/modules/task-queue/ui/useTaskQueueModalActions.test.ts`
- Test: `tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts`

- [ ] **Step 1: Write the failing action-hook tests**

Create `tests/unit/modules/task-queue/ui/useTaskQueueModalActions.test.ts` and move the interaction-heavy behavior there.

Cover at least these paths:

```ts
it("opens translated delete confirms and closes them after successful delete mutations", () => {
  const openSingleDeleteConfirm = vi.fn();
  const openDeleteAllConfirm = vi.fn();
  const closeDeleteConfirm = vi.fn();

  const { result } = renderHook(() =>
    useTaskQueueModalActions({
      ledgerId: "ledger-1",
      t: (key: string) => key,
      groupedItems,
      failedWithoutSourceDoc,
      deleteConfirm: {
        open: true,
        type: "single",
        id: "doc-1",
        title: "title",
        description: "description",
      },
      openSingleDeleteConfirm,
      openDeleteAllConfirm,
      closeDeleteConfirm,
      setRetrySourceDocId,
      mutations,
      push: pushMock,
      queryClient,
    })
  );

  act(() => {
    result.current.handleDeleteSingle(createItem({ sourceDocumentId: "doc-1" }));
  });
  expect(openSingleDeleteConfirm).toHaveBeenCalledWith("doc-1", "deleteConfirmTitle", "deleteConfirmDesc");
});

it("routes retry, anomaly delete, dismiss, cancel, details, and retry-success to the correct side effects", async () => {
  // failed retry -> batchRetry with source doc ids
  // anomaly delete -> batchDelete with anomaly source doc ids
  // dismiss all -> batchDismiss with task ids only
  // cancel/dismiss/detail view -> correct per-item mutation or modal-stack push
  // retry success -> invalidateQueries with invalidateTaskQueue(ledgerId)
});
```

- [ ] **Step 2: Run the action-hook test to verify it fails**

Run: `npm run test:unit -- tests/unit/modules/task-queue/ui/useTaskQueueModalActions.test.ts`
Expected: FAIL because `useTaskQueueModalActions.ts` does not exist yet.

- [ ] **Step 3: Implement `useTaskQueueModalActions.ts` and delegate from `useTaskQueueModal.ts`**

Implement the extracted action hook with semantic dependencies instead of reaching into `useState` directly:

```ts
interface UseTaskQueueModalActionsParams {
  ledgerId: string;
  t: (key: string) => string;
  groupedItems: TaskQueueGroupedItems;
  failedWithoutSourceDoc: QueueItem[];
  deleteConfirm: TaskQueueDeleteConfirmState;
  openSingleDeleteConfirm: (id: string, title: string, description: string) => void;
  openDeleteAllConfirm: (title: string, description: string) => void;
  closeDeleteConfirm: () => void;
  setRetrySourceDocId: (id: string | null) => void;
  mutations: ReturnType<typeof useTaskQueueMutations>;
  push: (entry: { type: "source-document"; id: string; ledgerId: string }) => void;
  queryClient: Pick<ReturnType<typeof useQueryClient>, "invalidateQueries">;
}
```

Drive the implementation through the pure selectors from Task 2:

```ts
const handleRetryAll = useCallback(
  (status: TaskQueueRetryStatus) => {
    const ids = collectSourceDocumentIds(groupedItems[status]);
    if (ids.length > 0) {
      mutations.batchRetry.mutate(ids);
    }
  },
  [groupedItems, mutations.batchRetry]
);

const handleDeleteAllAnomaly = useCallback(() => {
  const ids = collectSourceDocumentIds(groupedItems.anomaly);
  if (ids.length > 0) {
    mutations.batchDelete.mutate(ids);
  }
}, [groupedItems.anomaly, mutations.batchDelete]);
```

Then `useTaskQueueModal.ts` should become a small composer:

```ts
const sectionState = useTaskQueueSectionState();
const dialogState = useTaskQueueDialogState();
const actions = useTaskQueueModalActions({ ... });

return {
  ...sectionState,
  retrySourceDocId: dialogState.retrySourceDocId,
  deleteConfirm: dialogState.deleteConfirm,
  closeRetryDialog: dialogState.closeRetryDialog,
  closeDeleteConfirm: dialogState.closeDeleteConfirm,
  groupedItems,
  failedWithSourceDoc,
  failedWithoutSourceDoc,
  isEmpty,
  ...actions,
};
```

- [ ] **Step 4: Re-run the action-hook test and the composer hook test**

Run: `npm run test:unit -- tests/unit/modules/task-queue/ui/useTaskQueueModalActions.test.ts tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/task-queue/ui/useTaskQueueModalActions.ts \
  src/modules/task-queue/ui/useTaskQueueModal.ts \
  tests/unit/modules/task-queue/ui/useTaskQueueModalActions.test.ts \
  tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts
git commit -m "refactor: extract task queue modal actions"
```

### Task 5: Remove Raw Escape Hatches And Update Modal/Dialog Consumers

**Files:**
- Modify: `src/modules/task-queue/ui/useTaskQueueModal.ts`
- Modify: `src/modules/task-queue/ui/TaskQueueModal.tsx`
- Modify: `src/modules/task-queue/ui/TaskQueueDialogs.tsx`
- Modify: `tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts`
- Test: `tests/unit/modules/task-queue/ui`

- [ ] **Step 1: Write the failing composer-contract assertions**

Tighten `tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts` so the public hook surface no longer leaks raw dialog setters or raw mutation objects:

```ts
it("does not expose raw mutation objects or raw dialog setters", () => {
  const { result } = renderHook(() => useTaskQueueModal("ledger-1"));

  expect("batchDelete" in result.current).toBe(false);
  expect("batchRetry" in result.current).toBe(false);
  expect("cancelTask" in result.current).toBe(false);
  expect("dismissTask" in result.current).toBe(false);
  expect("setRetrySourceDocId" in result.current).toBe(false);
  expect("setDeleteConfirm" in result.current).toBe(false);
});
```

- [ ] **Step 2: Run the hook test to verify it fails**

Run: `npm run test:unit -- tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts`
Expected: FAIL because the old fields are still returned.

- [ ] **Step 3: Shrink the hook contract and switch consumers to semantic callbacks**

Update `UseTaskQueueModalReturn` and the returned object so only semantic handlers remain.

Update `TaskQueueModal.tsx` to use:

```tsx
<TaskQueueContent
  ...
  onDeleteAllAnomaly={handleDeleteAllAnomaly}
/>

<TaskQueueDialogs
  ledgerId={ledgerId}
  retrySourceDocId={retrySourceDocId}
  deleteConfirm={deleteConfirm}
  onCloseRetryDialog={closeRetryDialog}
  onCloseDeleteConfirm={closeDeleteConfirm}
  onDeleteConfirm={handleDeleteConfirmAction}
  onRetrySuccess={handleRetrySuccess}
/>
```

Update `TaskQueueDialogs.tsx` props to stop taking generic setter-like callbacks:

```ts
interface TaskQueueDialogsProps {
  ledgerId: string;
  retrySourceDocId: string | null;
  deleteConfirm: TaskQueueDeleteConfirmState;
  onCloseRetryDialog: () => void;
  onCloseDeleteConfirm: () => void;
  onDeleteConfirm: () => void;
  onRetrySuccess: () => void;
}
```

And wire them semantically:

```tsx
<ConfirmDialog
  open={deleteConfirm.open}
  onOpenChange={(open) => !open && onCloseDeleteConfirm()}
  ...
/>

<SourceDocumentEditRetryDialog
  ...
  onOpenChange={(open) => !open && onCloseRetryDialog()}
/>
```

- [ ] **Step 4: Run the full task-queue UI unit suite**

Run: `npm run test:unit -- tests/unit/modules/task-queue/ui`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/task-queue/ui/useTaskQueueModal.ts \
  src/modules/task-queue/ui/TaskQueueModal.tsx \
  src/modules/task-queue/ui/TaskQueueDialogs.tsx \
  tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts \
  tests/unit/modules/task-queue/ui/taskQueueModal.selectors.test.ts \
  tests/unit/modules/task-queue/ui/useTaskQueueSectionState.test.ts \
  tests/unit/modules/task-queue/ui/useTaskQueueDialogState.test.ts \
  tests/unit/modules/task-queue/ui/useTaskQueueModalActions.test.ts
git commit -m "refactor: slim task queue modal composer"
```

## Final Verification

After Task 5, run the task-queue UI suite one more time from a clean tree:

```bash
npm run test:unit -- tests/unit/modules/task-queue/ui
```

Expected:

- `taskQueueModal.selectors.test.ts` proves grouping/id-selection logic is pure and stable
- `useTaskQueueSectionState.test.ts` proves collapse state is isolated
- `useTaskQueueDialogState.test.ts` proves dialog state transitions are isolated
- `useTaskQueueModalActions.test.ts` proves orchestration is isolated
- `useTaskQueueModal.test.ts` stays small and only guards the public composer contract

That gives you a refactor that is easier to change later without turning `useTaskQueueModal.ts` back into the only place where all interaction logic goes to pile up.
