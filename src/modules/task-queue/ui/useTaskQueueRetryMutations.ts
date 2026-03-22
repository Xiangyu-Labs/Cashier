"use client";

import { invalidateSourceDocuments, invalidateTaskQueue } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { batchRetrySourceDocumentsAction } from "@/modules/source-document/actions";
import type { BatchRetrySourceDocumentsResultDto } from "@/modules/source-document/contracts";
import type { TaskQueueResult } from "@/modules/task-queue/contracts";
import { markItemsPendingBySourceDocId } from "./taskQueueOptimistic";

interface UseTaskQueueRetryMutationsParams {
  ledgerId: string;
  taskQueueKey: readonly unknown[];
  successMessage: string;
  errorMessage: string;
}

export function useTaskQueueRetryMutations({
  ledgerId,
  taskQueueKey,
  successMessage,
  errorMessage,
}: UseTaskQueueRetryMutationsParams) {
  const batchRetry = useLedgerMutation<BatchRetrySourceDocumentsResultDto, string[]>(ledgerId, {
    mutationFn: (ids) => batchRetrySourceDocumentsAction(ledgerId, ids),
    successMessage,
    errorMessage,
    cancelPredicates: [invalidateTaskQueue(ledgerId)],
    invalidatePredicates: [invalidateTaskQueue(ledgerId), invalidateSourceDocuments(ledgerId)],
    onOptimisticUpdate: (queryClient, ids) => {
      const snapshots = queryClient.getQueriesData<TaskQueueResult>({
        queryKey: taskQueueKey,
      });

      queryClient.setQueriesData<TaskQueueResult>({ queryKey: taskQueueKey }, (old) =>
        markItemsPendingBySourceDocId(old, ids)
      );

      return { snapshots };
    },
  });

  return { batchRetry };
}
