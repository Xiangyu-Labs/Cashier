import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { queryKeys } from "@/lib/query-keys";
import type { TaskQueueResult } from "../../../../../src/modules/task-queue/contracts";

const {
  createListSnapshotsMock,
  mutationOptions,
  useLedgerMutationMock,
} = vi.hoisted(() => ({
  mutationOptions: [] as Array<Record<string, unknown>>,
  useLedgerMutationMock: vi.fn((_ledgerId: string, options: Record<string, unknown>) => {
    mutationOptions.push(options);
    return {
      mutate: vi.fn(),
      isPending: false,
    };
  }),
  createListSnapshotsMock: vi.fn((queryClient: QueryClient, queryKey: readonly unknown[]) =>
    queryClient.getQueriesData({ queryKey })
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/mutations/use-ledger-mutation", () => ({
  useLedgerMutation: useLedgerMutationMock,
  createListSnapshots: createListSnapshotsMock,
}));

vi.mock("@/modules/source-document/actions", () => ({
  deleteSourceDocumentAction: vi.fn(),
  batchDeleteSourceDocumentsAction: vi.fn(),
  batchRetrySourceDocumentsAction: vi.fn(),
}));

vi.mock("@/modules/task-queue/actions", () => ({
  dismissTaskAction: vi.fn(),
  batchDismissTasksAction: vi.fn(),
  cancelTaskAction: vi.fn(),
  batchCancelTasksAction: vi.fn(),
}));

import { useTaskQueueMutations } from "../../../../../src/modules/task-queue/ui/useTaskQueueMutations";

function setTaskQueueCache(queryClient: QueryClient, ledgerId: string, data: TaskQueueResult) {
  queryClient.setQueryData(queryKeys.taskQueue(ledgerId), data);
}

function getCapturedOption(index: number) {
  const option = mutationOptions[index];
  if (option === undefined) {
    throw new Error(`Expected mutation option at index ${index}`);
  }
  return option;
}

describe("useTaskQueueMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationOptions.length = 0;
  });

  it("registers all task queue mutation definitions", () => {
    renderHook(() => useTaskQueueMutations("ledger-1"));

    expect(useLedgerMutationMock).toHaveBeenCalledTimes(7);
  });

  it("optimistically removes task IDs and updates stats total for cancel flows", () => {
    renderHook(() => useTaskQueueMutations("ledger-1"));
    const cancelOption = getCapturedOption(3);
    const onOptimisticUpdate = cancelOption.onOptimisticUpdate as (
      queryClient: QueryClient,
      taskId: string
    ) => { snapshots: unknown[] };

    const queryClient = new QueryClient();
    setTaskQueueCache(queryClient, "ledger-1", {
      items: [
        {
          id: "task-1",
          kind: "task",
          status: "running",
          title: "Task 1",
          createdAt: new Date().toISOString(),
        },
        {
          id: "task-2",
          kind: "task",
          status: "pending",
          title: "Task 2",
          createdAt: new Date().toISOString(),
        },
      ],
      stats: {
        pendingCount: 1,
        runningCount: 1,
        failedCount: 0,
        completedCount: 0,
        anomalyCount: 0,
        total: 2,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        avgTokensPerTask: 0,
      },
    });

    const context = onOptimisticUpdate(queryClient, "task-1");
    const updated = queryClient.getQueryData<TaskQueueResult>(queryKeys.taskQueue("ledger-1"));

    expect(updated?.items.map((item) => item.id)).toEqual(["task-2"]);
    expect(updated?.stats.total).toBe(1);
    expect(context.snapshots).toHaveLength(1);
    expect(createListSnapshotsMock).toHaveBeenCalled();
  });

  it("optimistically removes by sourceDocumentId for delete flows", () => {
    renderHook(() => useTaskQueueMutations("ledger-1"));
    const deleteOption = getCapturedOption(0);
    const onOptimisticUpdate = deleteOption.onOptimisticUpdate as (
      queryClient: QueryClient,
      sourceDocumentId: string
    ) => { snapshots: unknown[] };

    const queryClient = new QueryClient();
    setTaskQueueCache(queryClient, "ledger-1", {
      items: [
        {
          id: "task-1",
          kind: "task",
          status: "failed",
          title: "Task 1",
          createdAt: new Date().toISOString(),
          sourceDocumentId: "doc-1",
        },
        {
          id: "task-2",
          kind: "task",
          status: "failed",
          title: "Task 2",
          createdAt: new Date().toISOString(),
          sourceDocumentId: "doc-2",
        },
      ],
      stats: {
        pendingCount: 0,
        runningCount: 0,
        failedCount: 2,
        completedCount: 0,
        anomalyCount: 0,
        total: 2,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        avgTokensPerTask: 0,
      },
    });

    onOptimisticUpdate(queryClient, "doc-1");
    const updated = queryClient.getQueryData<TaskQueueResult>(queryKeys.taskQueue("ledger-1"));

    expect(updated?.items.map((item) => item.id)).toEqual(["task-2"]);
    expect(updated?.stats.total).toBe(1);
  });

  it("updates batchRetry status by sourceDocumentId instead of task id", () => {
    renderHook(() => useTaskQueueMutations("ledger-1"));
    const batchRetryOption = getCapturedOption(2);
    const onOptimisticUpdate = batchRetryOption.onOptimisticUpdate as (
      queryClient: QueryClient,
      ids: string[]
    ) => { snapshots: unknown[] };

    const queryClient = new QueryClient();
    setTaskQueueCache(queryClient, "ledger-1", {
      items: [
        {
          id: "task-1",
          kind: "task",
          status: "failed",
          title: "Task 1",
          createdAt: new Date().toISOString(),
          sourceDocumentId: "doc-1",
        },
        {
          id: "task-2",
          kind: "task",
          status: "failed",
          title: "Task 2",
          createdAt: new Date().toISOString(),
          sourceDocumentId: "doc-2",
        },
      ],
      stats: {
        pendingCount: 0,
        runningCount: 0,
        failedCount: 2,
        completedCount: 0,
        anomalyCount: 0,
        total: 2,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        avgTokensPerTask: 0,
      },
    });

    onOptimisticUpdate(queryClient, ["doc-1"]);
    const updated = queryClient.getQueryData<TaskQueueResult>(queryKeys.taskQueue("ledger-1"));
    const first = updated?.items[0];
    const second = updated?.items[1];

    expect(first?.status).toBe("pending");
    expect(second?.status).toBe("failed");
  });

  it("guards against malformed cached data without items in remove flows", () => {
    renderHook(() => useTaskQueueMutations("ledger-1"));
    const batchCancelOption = getCapturedOption(4);
    const onOptimisticUpdate = batchCancelOption.onOptimisticUpdate as (
      queryClient: QueryClient,
      taskIds: string[]
    ) => { snapshots: unknown[] };

    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.taskQueue("ledger-1"), {
      stats: { total: 5 },
    });

    expect(() => onOptimisticUpdate(queryClient, ["task-1"])).not.toThrow();
    expect(queryClient.getQueryData(queryKeys.taskQueue("ledger-1"))).toEqual({
      stats: { total: 5 },
    });
  });
});
