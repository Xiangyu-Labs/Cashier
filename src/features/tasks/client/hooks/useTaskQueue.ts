import { useSmartPolling } from '@/hooks/use-smart-polling';
import { queryKeys } from '@/lib/query-keys';
import { getTaskQueueAction, type TaskQueueResult, type SerializedTaskRun, type SerializedAnomalyBill } from '@/features/tasks/server/actions/task-queue';

/**
 * Hook for fetching the unified task queue from task_runs table.
 * Also includes anomaly bills from source_documents table.
 * 
 * Uses smart polling - polls every 3 seconds while there are pending or running tasks.
 */
export function useTaskQueue(ledgerId: string) {
    const { data, isLoading, refetch } = useSmartPolling<TaskQueueResult>({
        queryKey: queryKeys.taskQueue(ledgerId),
        queryFn: () => getTaskQueueAction(ledgerId),
        isActive: (data) => (data?.stats?.pendingCount || 0) > 0 || (data?.stats?.runningCount || 0) > 0,
        interval: 3000,
        enabled: !!ledgerId,
    });

    return {
        groups: data?.groups ?? {
            pending: [] as SerializedTaskRun[],
            running: [] as SerializedTaskRun[],
            failed: [] as SerializedTaskRun[],
            completed: [] as SerializedTaskRun[],
            anomaly: [] as SerializedAnomalyBill[],
        },
        stats: data?.stats ?? {
            pendingCount: 0,
            runningCount: 0,
            failedCount: 0,
            completedCount: 0,
            anomalyCount: 0,
            total: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            avgTokensPerTask: 0,
        },
        isLoading: isLoading && !data,
        refetch,
    };
}
