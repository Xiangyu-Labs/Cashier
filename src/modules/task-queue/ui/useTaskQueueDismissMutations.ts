"use client";

import { invalidateTaskQueue } from "@/lib/query-keys";
import { useLedgerMutation, createListSnapshots } from "@/lib/mutations/use-ledger-mutation";
import { batchDismissTasksAction, dismissTaskAction } from "@/modules/task-queue/actions";
import type { TaskQueueResult } from "@/modules/task-queue/contracts";
import { removeItemsById } from "./taskQueueOptimistic";

interface UseTaskQueueDismissMutationsParams {
  ledgerId: string;
  taskQueueKey: readonly unknown[];
  successMessage: string;
  errorMessage: string;
}

export function useTaskQueueDismissMutations({
  ledgerId,
  taskQueueKey,
  successMessage,
  errorMessage,
}: UseTaskQueueDismissMutationsParams) {
  const dismissTask = useLedgerMutation<void, string>(ledgerId, {
    mutationFn: (taskId) => dismissTaskAction(ledgerId, taskId),
    successMessage,
    errorMessage,
    cancelPredicates: [invalidateTaskQueue(ledgerId)],
    invalidatePredicates: [invalidateTaskQueue(ledgerId)],
    onOptimisticUpdate: (queryClient, taskId) => {
      const snapshots = createListSnapshots<TaskQueueResult>(queryClient, taskQueueKey);

      queryClient.setQueriesData<TaskQueueResult>({ queryKey: taskQueueKey }, (old) =>
        removeItemsById(old, [taskId])
      );

      return { snapshots };
    },
  });

  const batchDismiss = useLedgerMutation<void, string[]>(ledgerId, {
    mutationFn: (taskIds) => batchDismissTasksAction(ledgerId, taskIds),
    successMessage,
    errorMessage,
    cancelPredicates: [invalidateTaskQueue(ledgerId)],
    invalidatePredicates: [invalidateTaskQueue(ledgerId)],
    onOptimisticUpdate: (queryClient, taskIds) => {
      const snapshots = createListSnapshots<TaskQueueResult>(queryClient, taskQueueKey);

      queryClient.setQueriesData<TaskQueueResult>({ queryKey: taskQueueKey }, (old) =>
        removeItemsById(old, taskIds)
      );

      return { snapshots };
    },
  });

  return {
    dismissTask,
    batchDismiss,
  };
}
