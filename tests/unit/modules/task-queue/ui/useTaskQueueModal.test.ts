import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem, TaskQueueStats } from "@/modules/task-queue/contracts";

const {
  batchDeleteMutateMock,
  batchDismissMutateMock,
  batchRetryMutateMock,
  cancelTaskMutateMock,
  deleteSourceDocumentMutateMock,
  dismissTaskMutateMock,
  invalidateQueriesMock,
  pushMock,
  useTaskQueueMock,
  useTaskQueueMutationsMock,
} = vi.hoisted(() => ({
  useTaskQueueMock: vi.fn(),
  useTaskQueueMutationsMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  pushMock: vi.fn(),
  deleteSourceDocumentMutateMock: vi.fn(),
  batchDeleteMutateMock: vi.fn(),
  batchRetryMutateMock: vi.fn(),
  cancelTaskMutateMock: vi.fn(),
  dismissTaskMutateMock: vi.fn(),
  batchDismissMutateMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/modules/task-queue/ui/useTaskQueue", () => ({
  useTaskQueue: useTaskQueueMock,
}));

vi.mock("@/modules/task-queue/ui/useTaskQueueMutations", () => ({
  useTaskQueueMutations: useTaskQueueMutationsMock,
}));

vi.mock("@/lib/store/modal-stack", () => ({
  useModalStackStore: (selector: (state: { push: typeof pushMock }) => unknown) =>
    selector({ push: pushMock }),
}));

import { useTaskQueueModal } from "@/modules/task-queue/ui/useTaskQueueModal";

function createItem(overrides: Partial<QueueItem>): QueueItem {
  return {
    id: "item-1",
    kind: "task",
    status: "failed",
    title: "Queue item",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const baseStats: TaskQueueStats = {
  pendingCount: 0,
  runningCount: 0,
  failedCount: 0,
  completedCount: 0,
  anomalyCount: 0,
  total: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  avgTokensPerTask: 0,
};

describe("useTaskQueueModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useTaskQueueMock.mockReturnValue({
      items: [
        createItem({
          id: "pending-1",
          status: "pending",
          taskId: "task-pending",
        }),
        createItem({
          id: "failed-with-doc",
          status: "failed",
          sourceDocumentId: "doc-1",
          taskId: "task-failed-doc",
        }),
        createItem({
          id: "failed-no-doc",
          status: "failed",
          taskId: "task-failed-no-doc",
        }),
        createItem({
          id: "completed-1",
          status: "completed",
        }),
        createItem({
          id: "anomaly-1",
          kind: "anomaly",
          status: "anomaly",
          sourceDocumentId: "doc-anomaly-1",
        }),
      ],
      stats: {
        ...baseStats,
        pendingCount: 1,
        failedCount: 2,
        completedCount: 1,
        anomalyCount: 1,
        total: 4,
      },
      isLoading: false,
    });

    useTaskQueueMutationsMock.mockReturnValue({
      deleteSourceDocument: { mutate: deleteSourceDocumentMutateMock },
      batchDelete: { mutate: batchDeleteMutateMock },
      batchRetry: { mutate: batchRetryMutateMock },
      cancelTask: { mutate: cancelTaskMutateMock },
      dismissTask: { mutate: dismissTaskMutateMock },
      batchDismiss: { mutate: batchDismissMutateMock },
    });
  });

  it("groups items by status and computes failed source-document partitions", () => {
    const { result } = renderHook(() => useTaskQueueModal("ledger-1"));

    expect(result.current.groupedItems.pending).toHaveLength(1);
    expect(result.current.groupedItems.failed).toHaveLength(2);
    expect(result.current.groupedItems.completed).toHaveLength(1);
    expect(result.current.failedWithSourceDoc.map((item) => item.id)).toEqual(["failed-with-doc"]);
    expect(result.current.failedWithoutSourceDoc.map((item) => item.id)).toEqual(["failed-no-doc"]);
    expect(result.current.isEmpty).toBe(false);
  });

  it("opens single delete confirm and triggers deleteSourceDocument mutation", () => {
    const { result } = renderHook(() => useTaskQueueModal("ledger-1"));
    const target = createItem({
      id: "failed-with-doc",
      status: "failed",
      sourceDocumentId: "doc-1",
    });

    act(() => {
      result.current.handleDeleteSingle(target);
    });

    expect(result.current.deleteConfirm.open).toBe(true);
    expect(result.current.deleteConfirm.type).toBe("single");
    expect(result.current.deleteConfirm.id).toBe("doc-1");

    act(() => {
      result.current.handleDeleteConfirmAction();
    });

    expect(deleteSourceDocumentMutateMock).toHaveBeenCalledWith(
      "doc-1",
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it("handles batch retry/delete/dismiss and cancel/dismiss per item", () => {
    const { result } = renderHook(() => useTaskQueueModal("ledger-1"));
    const failedWithDoc = createItem({
      id: "failed-with-doc",
      status: "failed",
      sourceDocumentId: "doc-1",
      taskId: "task-failed-doc",
    });
    const failedWithoutDoc = createItem({
      id: "failed-no-doc",
      status: "failed",
      taskId: "task-failed-no-doc",
    });
    const pending = createItem({
      id: "pending-1",
      status: "pending",
      taskId: "task-pending",
    });

    act(() => {
      result.current.handleRetryAll("failed");
      result.current.handleDeleteAll();
      result.current.handleDismissAll();
      result.current.handleCancel(pending);
      result.current.handleDismiss(failedWithoutDoc);
      result.current.handleRetry(failedWithDoc);
    });

    act(() => {
      result.current.handleDeleteConfirmAction();
    });

    expect(batchRetryMutateMock).toHaveBeenCalledWith(["doc-1"]);
    expect(batchDeleteMutateMock).toHaveBeenCalledWith(
      ["doc-1"],
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(batchDismissMutateMock).toHaveBeenCalledWith(["task-failed-no-doc"]);
    expect(cancelTaskMutateMock).toHaveBeenCalledWith("task-pending");
    expect(dismissTaskMutateMock).toHaveBeenCalledWith("task-failed-no-doc");
    expect(result.current.retrySourceDocId).toBe("doc-1");
  });

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

  it("pushes source-document details and invalidates task-queue predicate on retry success", async () => {
    const { result } = renderHook(() => useTaskQueueModal("ledger-1"));
    const item = createItem({
      sourceDocumentId: "doc-42",
    });

    act(() => {
      result.current.handleViewDetails(item);
    });

    expect(pushMock).toHaveBeenCalledWith({
      type: "source-document",
      id: "doc-42",
      ledgerId: "ledger-1",
    });

    await act(async () => {
      await result.current.handleRetrySuccess();
    });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      predicate: expect.any(Function),
    });
  });

  it("does not expose raw mutation objects or raw dialog setters", () => {
    const { result } = renderHook(() => useTaskQueueModal("ledger-1"));

    expect("batchDelete" in result.current).toBe(false);
    expect("batchRetry" in result.current).toBe(false);
    expect("cancelTask" in result.current).toBe(false);
    expect("dismissTask" in result.current).toBe(false);
    expect("setRetrySourceDocId" in result.current).toBe(false);
    expect("setDeleteConfirm" in result.current).toBe(false);
  });
});
