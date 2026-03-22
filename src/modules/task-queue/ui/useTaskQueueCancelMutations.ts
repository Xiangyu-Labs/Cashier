"use client";

import { invalidateTaskQueue } from "@/lib/query-keys";
import { useLedgerMutation, createListSnapshots } from "@/lib/mutations/use-ledger-mutation";
import { batchCancelTasksAction, cancelTaskAction } from "@/modules/task-queue/actions";
import type { TaskQueueResult } from "@/modules/task-queue/contracts";
import { removeItemsById } from "./taskQueueOptimistic";

interface UseTaskQueueCancelMutationsParams {
  ledgerId: string;
  taskQueueKey: readonly unknown[];
  successMessage: string;
  errorMessage: string;
}

export function useTaskQueueCancelMutations({
  ledgerId,
  taskQueueKey,
  successMessage,
  errorMessage,
}: UseTaskQueueCancelMutationsParams) {
  const cancelTask = useLedgerMutation<void, string>(ledgerId, {
    mutationFn: (taskId) => cancelTaskAction(ledgerId, taskId),
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

  const batchCancel = useLedgerMutation<void, string[]>(ledgerId, {
    mutationFn: (taskIds) => batchCancelTasksAction(ledgerId, taskIds),
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
    cancelTask,
    batchCancel,
  };
}
