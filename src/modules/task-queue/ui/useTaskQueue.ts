import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getTaskQueueAction } from "@/modules/task-queue/actions";
import type { QueueItem, TaskQueueResult, TaskQueueStats } from "@/modules/task-queue/types";

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
  const { data, isLoading, refetch } = useQuery<TaskQueueResult>({
    queryKey: queryKeys.taskQueue(ledgerId),
    queryFn: () => getTaskQueueAction(ledgerId),
    refetchInterval: (query) => {
      const current = query.state.data;
      const hasActiveTasks =
        (current?.stats?.pendingCount ?? 0) > 0 || (current?.stats?.runningCount ?? 0) > 0;
      return hasActiveTasks ? 3000 : 60000;
    },
    enabled: ledgerId.length === 0 ? false : true,
  });

  return {
    items: data?.items ?? ([] as QueueItem[]),
    stats: data?.stats ?? defaultStats,
    isLoading: isLoading && data === undefined,
    refetch,
  };
}
