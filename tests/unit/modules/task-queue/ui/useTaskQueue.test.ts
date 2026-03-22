import { describe, expect, it, vi, beforeEach } from "vitest";

const { getTaskQueueActionMock, useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  getTaskQueueActionMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

vi.mock("@/modules/task-queue/actions", () => ({
  getTaskQueueAction: getTaskQueueActionMock,
}));

import { useTaskQueue } from "@/modules/task-queue/ui/useTaskQueue";

describe("useTaskQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables query when ledgerId is empty and uses default fallback values", async () => {
    const refetchMock = vi.fn();
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: refetchMock,
    });

    const result = useTaskQueue("");
    const options = useQueryMock.mock.calls[0]?.[0];

    expect(options?.enabled).toBe(false);
    await options?.queryFn();
    expect(getTaskQueueActionMock).toHaveBeenCalledWith("");

    expect(result.items).toEqual([]);
    expect(result.stats).toEqual({
      pendingCount: 0,
      runningCount: 0,
      failedCount: 0,
      completedCount: 0,
      anomalyCount: 0,
      total: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      avgTokensPerTask: 0,
    });
    expect(result.isLoading).toBe(true);
    expect(result.refetch).toBe(refetchMock);
  });

  it("uses smart polling interval based on pending/running stats", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: vi.fn(),
    });

    useTaskQueue("ledger-1");
    const options = useQueryMock.mock.calls[0]?.[0];

    expect(
      options?.refetchInterval({
        state: { data: { stats: { pendingCount: 1, runningCount: 0 } } },
      })
    ).toBe(3000);
    expect(
      options?.refetchInterval({
        state: { data: { stats: { pendingCount: 0, runningCount: 1 } } },
      })
    ).toBe(3000);
    expect(
      options?.refetchInterval({
        state: { data: { stats: { pendingCount: 0, runningCount: 0 } } },
      })
    ).toBe(60000);
  });

  it("does not report loading when data exists", () => {
    useQueryMock.mockReturnValue({
      data: {
        items: [
          {
            id: "task-1",
            kind: "task",
            status: "pending",
            title: "Task",
            createdAt: new Date().toISOString(),
          },
        ],
        stats: {
          pendingCount: 1,
          runningCount: 0,
          failedCount: 0,
          completedCount: 0,
          anomalyCount: 0,
          total: 1,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          avgTokensPerTask: 0,
        },
      },
      isLoading: true,
      refetch: vi.fn(),
    });

    const result = useTaskQueue("ledger-1");
    expect(result.items).toHaveLength(1);
    expect(result.stats.total).toBe(1);
    expect(result.isLoading).toBe(false);
  });
});
