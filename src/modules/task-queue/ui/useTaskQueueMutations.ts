"use client";
import { useTranslations } from "next-intl";
import { invalidateSourceDocuments, invalidateTaskQueue, queryKeys } from "@/lib/query-keys";
import { useLedgerMutation, createListSnapshots } from "@/lib/mutations/use-ledger-mutation";
import {
  deleteSourceDocumentAction,
  batchDeleteSourceDocumentsAction,
  batchRetrySourceDocumentsAction,
} from "@/modules/source-document/actions";
import type {
  BatchDeleteSourceDocumentsResultDto,
  BatchRetrySourceDocumentsResultDto,
  DeleteSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import type { TaskQueueResult } from "@/modules/task-queue/contracts";
import {
  dismissTaskAction,
  batchDismissTasksAction,
  cancelTaskAction,
  batchCancelTasksAction,
} from "@/modules/task-queue/actions";

function removeItemsById(
  old: TaskQueueResult | undefined,
  ids: string[]
): TaskQueueResult | undefined {
  if (old === undefined || old.items === undefined) return old;

  const idsSet = new Set(ids);
  const removedItems = old.items.filter((item) => idsSet.has(item.id));

  return {
    ...old,
    items: old.items.filter((item) => !idsSet.has(item.id)),
    stats: {
      ...old.stats,
      total: old.stats.total - removedItems.length,
    },
  };
}

function removeItemsBySourceDocId(
  old: TaskQueueResult | undefined,
  sourceDocIds: string[]
): TaskQueueResult | undefined {
  if (old === undefined || old.items === undefined) return old;

  const idsSet = new Set(sourceDocIds);
  const newItems = old.items.filter(
    (item) => item.sourceDocumentId === undefined || !idsSet.has(item.sourceDocumentId)
  );
  const removedCount = old.items.length - newItems.length;

  return {
    ...old,
    items: newItems,
    stats: {
      ...old.stats,
      total: old.stats.total - removedCount,
    },
  };
}

export function useTaskQueueMutations(ledgerId: string) {
  const t = useTranslations("TaskQueue");
  const tCommon = useTranslations("Common");
  const tEntries = useTranslations("LedgerEntriesTab");
  const taskQueueKey = queryKeys.taskQueue(ledgerId);

  const deleteSourceDocument = useLedgerMutation<DeleteSourceDocumentResultDto, string>(ledgerId, {
    mutationFn: (sourceDocumentId) => deleteSourceDocumentAction(ledgerId, sourceDocumentId),
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
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
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
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

  const batchRetry = useLedgerMutation<BatchRetrySourceDocumentsResultDto, string[]>(ledgerId, {
    mutationFn: (ids) => batchRetrySourceDocumentsAction(ledgerId, ids),
    successMessage: tEntries("retrySubmitted"),
    errorMessage: tCommon("error"),
    cancelPredicates: [invalidateTaskQueue(ledgerId)],
    invalidatePredicates: [invalidateTaskQueue(ledgerId), invalidateSourceDocuments(ledgerId)],
    onOptimisticUpdate: (queryClient, ids) => {
      const snapshots = queryClient.getQueriesData<TaskQueueResult>({
        queryKey: taskQueueKey,
      });

      queryClient.setQueriesData<TaskQueueResult>(
        { queryKey: taskQueueKey },
        (old): TaskQueueResult | undefined => {
          if (old === undefined || old.items === undefined) return old;

          return {
            ...old,
            items: old.items.map((item) =>
              item.sourceDocumentId !== undefined &&
              item.sourceDocumentId !== "" &&
              ids.includes(item.sourceDocumentId)
                ? { ...item, status: "pending" as const }
                : item
            ),
          };
        }
      );

      return { snapshots };
    },
  });

  const cancelTask = useLedgerMutation<void, string>(ledgerId, {
    mutationFn: (taskId) => cancelTaskAction(ledgerId, taskId),
    successMessage: t("cancelled"),
    errorMessage: tCommon("error"),
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
    successMessage: t("cancelled"),
    errorMessage: tCommon("error"),
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

  const dismissTask = useLedgerMutation<void, string>(ledgerId, {
    mutationFn: (taskId) => dismissTaskAction(ledgerId, taskId),
    successMessage: t("dismissed"),
    errorMessage: tCommon("error"),
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
    successMessage: t("dismissed"),
    errorMessage: tCommon("error"),
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
    deleteSourceDocument,
    batchDelete,
    batchRetry,
    cancelTask,
    batchCancel,
    dismissTask,
    batchDismiss,
  };
}
