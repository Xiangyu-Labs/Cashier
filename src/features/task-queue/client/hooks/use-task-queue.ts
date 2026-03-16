import { useSmartPolling } from '@/hooks/use-smart-polling';
import { queryKeys } from '@/lib/query-keys';
import { getTaskQueueAction, type TaskQueueResult, type TaskQueueStats } from '../../server/actions/task-queue';
import type { QueueItem } from '../../types';

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
    const { data, isLoading, refetch } = useSmartPolling<TaskQueueResult>({
        queryKey: queryKeys.taskQueue(ledgerId),
        queryFn: () => getTaskQueueAction(ledgerId),
        isActive: (data) => (data?.stats?.pendingCount || 0) > 0 || (data?.stats?.runningCount || 0) > 0,
        interval: 3000,
        idleInterval: 60000, // Check every 60s when idle to detect new tasks from API/other sources
        enabled: !!ledgerId,
        ledgerId,
    });

    return {
        items: data?.items ?? [] as QueueItem[],
        stats: data?.stats ?? defaultStats,
        isLoading: isLoading && !data,
        refetch,
    };
}
