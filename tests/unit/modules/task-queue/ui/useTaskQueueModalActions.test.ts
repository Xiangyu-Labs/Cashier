import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { QueueItem } from "@/modules/task-queue/contracts";
import { groupTaskQueueItems, partitionFailedItems } from "@/modules/task-queue/ui/taskQueueModal.selectors";
import { EMPTY_TASK_QUEUE_DELETE_CONFIRM } from "@/modules/task-queue/ui/taskQueueModal.types";
import { useTaskQueueModalActions } from "@/modules/task-queue/ui/useTaskQueueModalActions";

function createItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "item-1",
    kind: "task",
    status: "failed",
    title: "Queue item",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMutations() {
  return {
    deleteSourceDocument: { mutate: vi.fn() },
    batchDelete: { mutate: vi.fn() },
    batchRetry: { mutate: vi.fn() },
    cancelTask: { mutate: vi.fn() },
    dismissTask: { mutate: vi.fn() },
    batchDismiss: { mutate: vi.fn() },
  };
}

describe("useTaskQueueModalActions", () => {
  it("opens translated delete confirms and closes them after successful delete mutations", () => {
    const openSingleDeleteConfirm = vi.fn();
    const openDeleteAllConfirm = vi.fn();
    const closeDeleteConfirm = vi.fn();
    const setRetrySourceDocId = vi.fn();
    const push = vi.fn();
    const queryClient = { invalidateQueries: vi.fn() };
    const mutations = createMutations();
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

    const { result, rerender } = renderHook(
      ({ deleteConfirm }) =>
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
        initialProps: {
          deleteConfirm: {
            open: true,
            type: "single" as const,
            id: "doc-1",
            title: "title",
            description: "description",
          },
        },
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
    expect(mutations.deleteSourceDocument.mutate).toHaveBeenCalledWith(
      "doc-1",
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );

    act(() => {
      mutations.deleteSourceDocument.mutate.mock.calls[0][1].onSuccess();
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

    expect(mutations.batchDelete.mutate).toHaveBeenCalledWith(
      ["doc-1"],
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );

    act(() => {
      mutations.batchDelete.mutate.mock.calls[0][1].onSuccess();
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
    const mutations = createMutations();
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
    expect(mutations.batchRetry.mutate).toHaveBeenNthCalledWith(1, ["doc-1"]);
    expect(mutations.batchRetry.mutate).toHaveBeenNthCalledWith(2, ["doc-anomaly-1"]);
    expect(mutations.batchDelete.mutate).toHaveBeenCalledWith(["doc-anomaly-1"]);
    expect(mutations.batchDismiss.mutate).toHaveBeenCalledWith(["task-failed-no-doc"]);
    expect(mutations.cancelTask.mutate).toHaveBeenCalledWith("task-pending");
    expect(mutations.dismissTask.mutate).toHaveBeenCalledWith("task-failed-no-doc");
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

    const predicate = queryClient.invalidateQueries.mock.calls[0][0].predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;

    expect(predicate({ queryKey: ["taskQueue", "ledger-1"] })).toBe(true);
    expect(predicate({ queryKey: ["processingTasks", "ledger-1"] })).toBe(true);
    expect(predicate({ queryKey: ["sourceDocuments", "ledger-1"] })).toBe(false);
  });
});
