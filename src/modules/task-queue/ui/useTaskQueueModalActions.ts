"use client";

import { useCallback } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { invalidateTaskQueue } from "@/lib/query-keys";
import type { ModalItem } from "@/lib/store/modal-stack";
import type { QueueItem } from "@/modules/task-queue/contracts";
import {
  collectSourceDocumentIds,
  collectTaskIds,
} from "./taskQueueModal.selectors";
import type {
  TaskQueueDeleteConfirmState,
  TaskQueueGroupedItems,
  TaskQueueRetryStatus,
} from "./taskQueueModal.types";
import { useTaskQueueMutations } from "./useTaskQueueMutations";

type SourceDocumentModal = Extract<ModalItem, { type: "source-document" }>;

interface UseTaskQueueModalActionsParams {
  ledgerId: string;
  t: (key: string) => string;
  groupedItems: TaskQueueGroupedItems;
  failedWithoutSourceDoc: QueueItem[];
  deleteConfirm: TaskQueueDeleteConfirmState;
  openSingleDeleteConfirm: (id: string, title: string, description: string) => void;
  openDeleteAllConfirm: (title: string, description: string) => void;
  closeDeleteConfirm: () => void;
  setRetrySourceDocId: (id: string | null) => void;
  mutations: ReturnType<typeof useTaskQueueMutations>;
  push: (entry: SourceDocumentModal) => void;
  queryClient: Pick<QueryClient, "invalidateQueries">;
}

export function useTaskQueueModalActions({
  ledgerId,
  t,
  groupedItems,
  failedWithoutSourceDoc,
  deleteConfirm,
  openSingleDeleteConfirm,
  openDeleteAllConfirm,
  closeDeleteConfirm,
  setRetrySourceDocId,
  mutations,
  push,
  queryClient,
}: UseTaskQueueModalActionsParams) {
  const handleDeleteConfirmAction = useCallback(() => {
    if (deleteConfirm.type == null) return;

    if (deleteConfirm.type === "single" && deleteConfirm.id != null && deleteConfirm.id !== "") {
      mutations.deleteSourceDocument.mutate(deleteConfirm.id, {
        onSuccess: closeDeleteConfirm,
      });
      return;
    }

    if (deleteConfirm.type === "all") {
      const ids = collectSourceDocumentIds(groupedItems.failed);
      if (ids.length > 0) {
        mutations.batchDelete.mutate(ids, {
          onSuccess: closeDeleteConfirm,
        });
      }
    }
  }, [closeDeleteConfirm, deleteConfirm, groupedItems.failed, mutations]);

  const handleRetry = useCallback(
    (item: QueueItem) => {
      if (item.sourceDocumentId != null && item.sourceDocumentId !== "") {
        setRetrySourceDocId(item.sourceDocumentId);
      }
    },
    [setRetrySourceDocId]
  );

  const handleDeleteSingle = useCallback(
    (item: QueueItem) => {
      if (item.sourceDocumentId == null || item.sourceDocumentId === "") return;

      openSingleDeleteConfirm(item.sourceDocumentId, t("deleteConfirmTitle"), t("deleteConfirmDesc"));
    },
    [openSingleDeleteConfirm, t]
  );

  const handleDeleteAll = useCallback(() => {
    openDeleteAllConfirm(t("deleteAllConfirmTitle"), t("deleteAllConfirmDesc"));
  }, [openDeleteAllConfirm, t]);

  const handleDeleteAllAnomaly = useCallback(() => {
    const ids = collectSourceDocumentIds(groupedItems.anomaly);
    if (ids.length > 0) {
      mutations.batchDelete.mutate(ids);
    }
  }, [groupedItems.anomaly, mutations]);

  const handleRetryAll = useCallback(
    (status: TaskQueueRetryStatus) => {
      const ids = collectSourceDocumentIds(groupedItems[status]);
      if (ids.length > 0) {
        mutations.batchRetry.mutate(ids);
      }
    },
    [groupedItems, mutations]
  );

  const handleCancel = useCallback(
    (item: QueueItem) => {
      if (item.taskId != null && item.taskId !== "") {
        mutations.cancelTask.mutate(item.taskId);
      }
    },
    [mutations]
  );

  const handleDismiss = useCallback(
    (item: QueueItem) => {
      if (item.taskId != null && item.taskId !== "") {
        mutations.dismissTask.mutate(item.taskId);
      }
    },
    [mutations]
  );

  const handleDismissAll = useCallback(() => {
    const ids = collectTaskIds(failedWithoutSourceDoc);
    if (ids.length > 0) {
      mutations.batchDismiss.mutate(ids);
    }
  }, [failedWithoutSourceDoc, mutations]);

  const handleViewDetails = useCallback(
    (item: QueueItem) => {
      if (item.sourceDocumentId != null && item.sourceDocumentId !== "") {
        push({ type: "source-document", id: item.sourceDocumentId, ledgerId });
      }
    },
    [ledgerId, push]
  );

  const handleRetrySuccess = useCallback(async () => {
    await queryClient.invalidateQueries({ predicate: invalidateTaskQueue(ledgerId) });
  }, [ledgerId, queryClient]);

  return {
    handleDeleteConfirmAction,
    handleRetry,
    handleDeleteSingle,
    handleDeleteAll,
    handleDeleteAllAnomaly,
    handleRetryAll,
    handleCancel,
    handleDismiss,
    handleDismissAll,
    handleViewDetails,
    handleRetrySuccess,
  };
}
