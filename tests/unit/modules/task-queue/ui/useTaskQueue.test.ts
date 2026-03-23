import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTaskQueueActionMock, useQueryMock, useSmartPollingMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  getTaskQueueActionMock: vi.fn(),
  useSmartPollingMock: vi.fn(() => "polling-fn"),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

vi.mock("@/modules/task-queue/actions", () => ({
  getTaskQueueAction: getTaskQueueActionMock,
}));

vi.mock("@/hooks/use-smart-polling", () => ({
  useSmartPolling: useSmartPollingMock,
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

  it("builds task queue polling with useSmartPolling", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: vi.fn(),
    });

    useTaskQueue("ledger-1");

    expect(useSmartPollingMock).toHaveBeenCalledWith({
      isPollingActive: expect.any(Function),
      activeIntervalMs: 3000,
      idleIntervalMs: 15000,
    });

    const options = useQueryMock.mock.calls[0]?.[0];
    expect(options?.refetchInterval).toBe("polling-fn");
  });

  it("preserves the active and idle polling cadence", () => {
    useSmartPollingMock.mockImplementation(
      ({ isPollingActive, activeIntervalMs, idleIntervalMs }) =>
        (query: { state: { data: unknown } }) =>
          isPollingActive(query.state.data) ? activeIntervalMs : idleIntervalMs
    );
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
    ).toBe(15000);
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
