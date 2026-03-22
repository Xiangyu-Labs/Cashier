"use client";

import { invalidateSourceDocuments, invalidateTaskQueue } from "@/lib/query-keys";
import { useLedgerMutation, createListSnapshots } from "@/lib/mutations/use-ledger-mutation";
import {
  batchDeleteSourceDocumentsAction,
  deleteSourceDocumentAction,
} from "@/modules/source-document/actions";
import type {
  BatchDeleteSourceDocumentsResultDto,
  DeleteSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import type { TaskQueueResult } from "@/modules/task-queue/contracts";
import { removeItemsBySourceDocId } from "./taskQueueOptimistic";

interface UseTaskQueueDeleteMutationsParams {
  ledgerId: string;
  taskQueueKey: readonly unknown[];
  successMessage: string;
  errorMessage: string;
}

export function useTaskQueueDeleteMutations({
  ledgerId,
  taskQueueKey,
  successMessage,
  errorMessage,
}: UseTaskQueueDeleteMutationsParams) {
  const deleteSourceDocument = useLedgerMutation<DeleteSourceDocumentResultDto, string>(ledgerId, {
    mutationFn: (sourceDocumentId) => deleteSourceDocumentAction(ledgerId, sourceDocumentId),
    successMessage,
    errorMessage,
    cancelPredicates: [invalidateTaskQueue(ledgerId)],
    invalidatePredicates: [invalidateTaskQueue(ledgerId), invalidateSourceDocuments(ledgerId)],
    onOptimisticUpdate: (queryClient, sourceDocumentId) => {
      const snapshots = createListSnapshots<TaskQueueResult>(queryClient, taskQueueKey);

      queryClient.setQueriesData<TaskQueueResult>({ queryKey: taskQueueKey }, (old) =>
        removeItemsBySourceDocId(old, [sourceDocumentId])
      );

      return { snapshots };
    },
  });

  const batchDelete = useLedgerMutation<BatchDeleteSourceDocumentsResultDto, string[]>(ledgerId, {
    mutationFn: (ids) => batchDeleteSourceDocumentsAction(ledgerId, ids),
    successMessage,
    errorMessage,
    cancelPredicates: [invalidateTaskQueue(ledgerId)],
    invalidatePredicates: [invalidateTaskQueue(ledgerId), invalidateSourceDocuments(ledgerId)],
    onOptimisticUpdate: (queryClient, ids) => {
      const snapshots = createListSnapshots<TaskQueueResult>(queryClient, taskQueueKey);

      queryClient.setQueriesData<TaskQueueResult>({ queryKey: taskQueueKey }, (old) =>
        removeItemsBySourceDocId(old, ids)
      );

      return { snapshots };
    },
  });

  return {
    deleteSourceDocument,
    batchDelete,
  };
}
