import { useQuery } from "@tanstack/react-query";
import { useSmartPolling } from "@/hooks/use-smart-polling";
import { queryKeys } from "@/lib/query-keys";
import { getTaskQueueAction } from "@/modules/task-queue/actions";
import type { QueueItem, TaskQueueResult, TaskQueueStats } from "@/modules/task-queue/contracts";

const defaultStats: TaskQueueStats = {
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

/**
 * Hook for fetching the unified task queue.
 * Returns a flat list of QueueItems from both task_runs and source_documents (anomaly).
 *
 * Uses smart polling - polls every 3 seconds while there are pending or running tasks.
 */
export function useTaskQueue(ledgerId: string) {
  const taskQueuePolling = useSmartPolling<TaskQueueResult>({
    isPollingActive: (data) =>
      (data?.stats?.pendingCount ?? 0) > 0 || (data?.stats?.runningCount ?? 0) > 0,
    activeIntervalMs: 3000,
    idleIntervalMs: 15000,
  });

  const { data, isLoading, refetch } = useQuery<TaskQueueResult>({
    queryKey: queryKeys.taskQueue(ledgerId),
    queryFn: () => getTaskQueueAction(ledgerId),
    refetchInterval: taskQueuePolling,
    enabled: ledgerId.length > 0,
  });

  return {
    items: data?.items ?? ([] as QueueItem[]),
    stats: data?.stats ?? defaultStats,
    isLoading: isLoading && data === undefined,
    refetch,
  };
}
