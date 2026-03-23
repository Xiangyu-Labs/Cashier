import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { QueueItem } from "@/modules/task-queue/contracts";
import { groupTaskQueueItems, partitionFailedItems } from "@/modules/task-queue/ui/taskQueueModal.selectors";
import { EMPTY_TASK_QUEUE_DELETE_CONFIRM } from "@/modules/task-queue/ui/taskQueueModal.types";
import { useTaskQueueModalActions } from "@/modules/task-queue/ui/useTaskQueueModalActions";
import { asQueryLike } from "tests/helpers/react-query";

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
  type TaskQueueMutations = Parameters<typeof useTaskQueueModalActions>[0]["mutations"];
  const deleteSourceDocumentMutate = vi.fn();
  const batchDeleteMutate = vi.fn();
  const batchRetryMutate = vi.fn();
  const cancelTaskMutate = vi.fn();
  const batchCancelMutate = vi.fn();
  const dismissTaskMutate = vi.fn();
  const batchDismissMutate = vi.fn();

  return {
    mutations: {
      deleteSourceDocument: {
        mutate: deleteSourceDocumentMutate,
      } as unknown as TaskQueueMutations["deleteSourceDocument"],
      batchDelete: { mutate: batchDeleteMutate } as unknown as TaskQueueMutations["batchDelete"],
      batchRetry: { mutate: batchRetryMutate } as unknown as TaskQueueMutations["batchRetry"],
      cancelTask: { mutate: cancelTaskMutate } as unknown as TaskQueueMutations["cancelTask"],
      batchCancel: { mutate: batchCancelMutate } as unknown as TaskQueueMutations["batchCancel"],
      dismissTask: { mutate: dismissTaskMutate } as unknown as TaskQueueMutations["dismissTask"],
      batchDismiss: { mutate: batchDismissMutate } as unknown as TaskQueueMutations["batchDismiss"],
    } satisfies TaskQueueMutations,
    deleteSourceDocumentMutate,
    batchDeleteMutate,
    batchRetryMutate,
    cancelTaskMutate,
    batchCancelMutate,
    dismissTaskMutate,
    batchDismissMutate,
  };
}

type HookProps = {
  deleteConfirm: {
    open: boolean;
    type: "single" | "all" | null;
    id: string | null;
    title: string;
    description: string;
  };
};

describe("useTaskQueueModalActions", () => {
  it("opens translated delete confirms and closes them after successful delete mutations", () => {
    const openSingleDeleteConfirm = vi.fn();
    const openDeleteAllConfirm = vi.fn();
    const closeDeleteConfirm = vi.fn();
    const setRetrySourceDocId = vi.fn();
    const push = vi.fn();
    const queryClient = { invalidateQueries: vi.fn() };
    const { mutations, deleteSourceDocumentMutate, batchDeleteMutate } = createMutations();
    const groupedItems = groupTaskQueueItems([
      createItem({
        id: "failed-doc",
        status: "failed",
        sourceDocumentId: "doc-1",
        taskId: "task-1",
      }),
      createItem({
        id: "failed-no-doc",
        status: "failed",
        taskId: "task-2",
      }),
    ]);
    const failedWithoutSourceDoc = partitionFailedItems(groupedItems.failed).withoutSourceDoc;
    const initialProps: HookProps = {
      deleteConfirm: {
        open: true,
        type: "single",
        id: "doc-1",
        title: "title",
        description: "description",
      },
    };

    const { result, rerender } = renderHook(
      ({ deleteConfirm }: HookProps) =>
        useTaskQueueModalActions({
          ledgerId: "ledger-1",
          t: (key: string) => key,
          groupedItems,
          failedWithoutSourceDoc,
          deleteConfirm,
          openSingleDeleteConfirm,
          openDeleteAllConfirm,
          closeDeleteConfirm,
          setRetrySourceDocId,
          mutations,
          push,
          queryClient,
        }),
      {
        initialProps,
      }
    );

    act(() => {
      result.current.handleDeleteSingle(createItem({ sourceDocumentId: "doc-1" }));
      result.current.handleDeleteAll();
      result.current.handleDeleteConfirmAction();
    });

    expect(openSingleDeleteConfirm).toHaveBeenCalledWith(
      "doc-1",
      "deleteConfirmTitle",
      "deleteConfirmDesc"
    );
    expect(openDeleteAllConfirm).toHaveBeenCalledWith(
      "deleteAllConfirmTitle",
      "deleteAllConfirmDesc"
    );
    expect(deleteSourceDocumentMutate).toHaveBeenCalledWith(
      "doc-1",
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );

    const deleteMutationOptions = deleteSourceDocumentMutate.mock.calls[0]?.[1];
    expect(deleteMutationOptions).toBeDefined();
    if (deleteMutationOptions == null) {
      throw new Error("Expected delete mutation options");
    }

    act(() => {
      deleteMutationOptions.onSuccess();
    });

    expect(closeDeleteConfirm).toHaveBeenCalledTimes(1);

    rerender({
      deleteConfirm: {
        open: true,
        type: "all",
        id: null,
        title: "title",
        description: "description",
      },
    });

    act(() => {
      result.current.handleDeleteConfirmAction();
    });

    expect(batchDeleteMutate).toHaveBeenCalledWith(
      ["doc-1"],
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );

    const batchDeleteOptions = batchDeleteMutate.mock.calls[0]?.[1];
    expect(batchDeleteOptions).toBeDefined();
    if (batchDeleteOptions == null) {
      throw new Error("Expected batch delete options");
    }

    act(() => {
      batchDeleteOptions.onSuccess();
    });

    expect(closeDeleteConfirm).toHaveBeenCalledTimes(2);
  });

  it("routes retry, anomaly delete, dismiss, cancel, details, and retry-success to the correct side effects", async () => {
    const openSingleDeleteConfirm = vi.fn();
    const openDeleteAllConfirm = vi.fn();
    const closeDeleteConfirm = vi.fn();
    const setRetrySourceDocId = vi.fn();
    const push = vi.fn();
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    };
    const {
      mutations,
      batchRetryMutate,
      batchDeleteMutate,
      batchDismissMutate,
      cancelTaskMutate,
      dismissTaskMutate,
    } = createMutations();
    const groupedItems = groupTaskQueueItems([
      createItem({
        id: "failed-doc",
        status: "failed",
        sourceDocumentId: "doc-1",
        taskId: "task-1",
      }),
      createItem({
        id: "failed-no-doc",
        status: "failed",
        taskId: "task-failed-no-doc",
      }),
      createItem({
        id: "anomaly-1",
        kind: "anomaly",
        status: "anomaly",
        sourceDocumentId: "doc-anomaly-1",
      }),
      createItem({
        id: "pending-1",
        status: "pending",
        taskId: "task-pending",
      }),
      createItem({
        id: "completed-1",
        status: "completed",
        sourceDocumentId: "doc-42",
      }),
    ]);
    const failedWithoutSourceDoc = partitionFailedItems(groupedItems.failed).withoutSourceDoc;

    const { result } = renderHook(() =>
      useTaskQueueModalActions({
        ledgerId: "ledger-1",
        t: (key: string) => key,
        groupedItems,
        failedWithoutSourceDoc,
        deleteConfirm: EMPTY_TASK_QUEUE_DELETE_CONFIRM,
        openSingleDeleteConfirm,
        openDeleteAllConfirm,
        closeDeleteConfirm,
        setRetrySourceDocId,
        mutations,
        push,
        queryClient,
      })
    );

    act(() => {
      result.current.handleRetry(createItem({ sourceDocumentId: "doc-1" }));
      result.current.handleRetryAll("failed");
      result.current.handleRetryAll("anomaly");
      result.current.handleDeleteAllAnomaly();
      result.current.handleDismissAll();
      result.current.handleCancel(createItem({ taskId: "task-pending" }));
      result.current.handleDismiss(createItem({ taskId: "task-failed-no-doc" }));
      result.current.handleViewDetails(createItem({ sourceDocumentId: "doc-42" }));
    });

    expect(setRetrySourceDocId).toHaveBeenCalledWith("doc-1");
    expect(batchRetryMutate).toHaveBeenNthCalledWith(1, ["doc-1"]);
    expect(batchRetryMutate).toHaveBeenNthCalledWith(2, ["doc-anomaly-1"]);
    expect(batchDeleteMutate).toHaveBeenCalledWith(["doc-anomaly-1"]);
    expect(batchDismissMutate).toHaveBeenCalledWith(["task-failed-no-doc"]);
    expect(cancelTaskMutate).toHaveBeenCalledWith("task-pending");
    expect(dismissTaskMutate).toHaveBeenCalledWith("task-failed-no-doc");
    expect(push).toHaveBeenCalledWith({
      type: "source-document",
      id: "doc-42",
      ledgerId: "ledger-1",
    });

    await act(async () => {
      await result.current.handleRetrySuccess();
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      predicate: expect.any(Function),
    });

    const predicate = queryClient.invalidateQueries.mock.calls[0]?.[0]?.predicate;
    expect(predicate).toBeTypeOf("function");
    if (predicate == null) {
      throw new Error("Expected invalidate predicate");
    }

    expect(predicate(asQueryLike(["taskQueue", "ledger-1"]))).toBe(true);
    expect(predicate(asQueryLike(["processingTasks", "ledger-1"]))).toBe(true);
    expect(predicate(asQueryLike(["sourceDocuments", "ledger-1"]))).toBe(false);
  });
});
