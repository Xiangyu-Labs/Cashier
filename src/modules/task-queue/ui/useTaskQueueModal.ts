"use client";
import { useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { invalidateTaskQueue } from "@/lib/query-keys";
import { useModalStackStore } from "@/lib/store/modal-stack";
import type { QueueItem } from "@/modules/task-queue/contracts";
import {
  groupTaskQueueItems,
  isTaskQueueEmpty,
  partitionFailedItems,
} from "./taskQueueModal.selectors";
import type {
  TaskQueueDeleteConfirmState,
  TaskQueueGroupedItems,
  TaskQueueRetryStatus,
} from "./taskQueueModal.types";
import { useTaskQueueDialogState } from "./useTaskQueueDialogState";
import { useTaskQueueSectionState } from "./useTaskQueueSectionState";
import { useTaskQueue } from "./useTaskQueue";
import { useTaskQueueMutations } from "./useTaskQueueMutations";

export interface UseTaskQueueModalReturn {
  isPendingCollapsed: boolean;
  isRunningCollapsed: boolean;
  isFailedCollapsed: boolean;
  isAnomalyCollapsed: boolean;
  isCompletedCollapsed: boolean;
  retrySourceDocId: string | null;
  deleteConfirm: TaskQueueDeleteConfirmState;
  items: QueueItem[];
  stats: ReturnType<typeof useTaskQueue>["stats"];
  isLoading: boolean;
  groupedItems: TaskQueueGroupedItems;
  isEmpty: boolean;
  failedWithSourceDoc: QueueItem[];
  failedWithoutSourceDoc: QueueItem[];
  deleteSourceDocument: ReturnType<typeof useTaskQueueMutations>["deleteSourceDocument"];
  batchDelete: ReturnType<typeof useTaskQueueMutations>["batchDelete"];
  batchRetry: ReturnType<typeof useTaskQueueMutations>["batchRetry"];
  cancelTask: ReturnType<typeof useTaskQueueMutations>["cancelTask"];
  dismissTask: ReturnType<typeof useTaskQueueMutations>["dismissTask"];
  batchDismiss: ReturnType<typeof useTaskQueueMutations>["batchDismiss"];
  setIsPendingCollapsed: (value: boolean) => void;
  setIsRunningCollapsed: (value: boolean) => void;
  setIsFailedCollapsed: (value: boolean) => void;
  setIsAnomalyCollapsed: (value: boolean) => void;
  setIsCompletedCollapsed: (value: boolean) => void;
  closeRetryDialog: () => void;
  closeDeleteConfirm: () => void;
  setRetrySourceDocId: (id: string | null) => void;
  setDeleteConfirm: React.Dispatch<
    React.SetStateAction<{
      open: boolean;
      type: "single" | "all" | null;
      id: string | null;
      title: string;
      description: string;
    }>
  >;
  handleDeleteConfirmAction: () => void;
  handleRetry: (item: QueueItem) => void;
  handleDeleteSingle: (item: QueueItem) => void;
  handleDeleteAll: () => void;
  handleDeleteAllAnomaly: () => void;
  handleRetryAll: (status: TaskQueueRetryStatus) => void;
  handleCancel: (item: QueueItem) => void;
  handleDismiss: (item: QueueItem) => void;
  handleDismissAll: () => void;
  handleViewDetails: (item: QueueItem) => void;
  handleRetrySuccess: () => Promise<void>;
}

export function useTaskQueueModal(ledgerId: string): UseTaskQueueModalReturn {
  const t = useTranslations("TaskQueue");
  const queryClient = useQueryClient();
  const { items, stats, isLoading } = useTaskQueue(ledgerId);
  const { deleteSourceDocument, batchDelete, batchRetry, cancelTask, dismissTask, batchDismiss } =
    useTaskQueueMutations(ledgerId);
  const sectionState = useTaskQueueSectionState();
  const dialogState = useTaskQueueDialogState();
  const {
    isPendingCollapsed,
    isRunningCollapsed,
    isFailedCollapsed,
    isAnomalyCollapsed,
    isCompletedCollapsed,
    setIsPendingCollapsed,
    setIsRunningCollapsed,
    setIsFailedCollapsed,
    setIsAnomalyCollapsed,
    setIsCompletedCollapsed,
  } = sectionState;
  const {
    retrySourceDocId,
    deleteConfirm,
    setRetrySourceDocId,
    setDeleteConfirm,
    openSingleDeleteConfirm,
    openDeleteAllConfirm,
    closeDeleteConfirm,
    closeRetryDialog,
  } = dialogState;

  const groupedItems = useMemo(() => groupTaskQueueItems(items), [items]);
  const { withSourceDoc: failedWithSourceDoc, withoutSourceDoc: failedWithoutSourceDoc } =
    useMemo(() => partitionFailedItems(groupedItems.failed), [groupedItems.failed]);

  const handleDeleteConfirmAction = useCallback(() => {
    if (deleteConfirm.type == null) return;

    if (deleteConfirm.type === "single" && deleteConfirm.id != null && deleteConfirm.id !== "") {
      deleteSourceDocument.mutate(deleteConfirm.id, {
        onSuccess: () => setDeleteConfirm((previous) => ({ ...previous, open: false })),
      });
      return;
    }

    if (deleteConfirm.type === "all") {
      const ids = groupedItems.failed
        .filter((item) => item.sourceDocumentId != null && item.sourceDocumentId !== "")
        .map((item) => item.sourceDocumentId!);
      batchDelete.mutate(ids, {
        onSuccess: () => setDeleteConfirm((previous) => ({ ...previous, open: false })),
      });
    }
  }, [deleteConfirm, deleteSourceDocument, batchDelete, groupedItems.failed]);

  const handleRetry = useCallback((item: QueueItem) => {
    if (item.sourceDocumentId != null && item.sourceDocumentId !== "") {
      setRetrySourceDocId(item.sourceDocumentId);
    }
  }, []);

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
    const ids = groupedItems.anomaly
      .map((item) => item.sourceDocumentId)
      .filter((id): id is string => id != null && id !== "");

    if (ids.length > 0) {
      batchDelete.mutate(ids);
    }
  }, [groupedItems.anomaly, batchDelete]);

  const handleRetryAll = useCallback(
    (status: TaskQueueRetryStatus) => {
      const itemsToRetry = groupedItems[status].filter(
        (item) => item.sourceDocumentId != null && item.sourceDocumentId !== ""
      );
      const ids = itemsToRetry.map((item) => item.sourceDocumentId!);
      batchRetry.mutate(ids);
    },
    [groupedItems, batchRetry]
  );

  const handleCancel = useCallback(
    (item: QueueItem) => {
      if (item.taskId != null && item.taskId !== "") {
        cancelTask.mutate(item.taskId);
      }
    },
    [cancelTask]
  );

  const handleDismiss = useCallback(
    (item: QueueItem) => {
      if (item.taskId != null && item.taskId !== "") {
        dismissTask.mutate(item.taskId);
      }
    },
    [dismissTask]
  );

  const push = useModalStackStore((state) => state.push);

  const handleViewDetails = useCallback(
    (item: QueueItem) => {
      if (item.sourceDocumentId != null && item.sourceDocumentId !== "") {
        push({ type: "source-document", id: item.sourceDocumentId, ledgerId });
      }
    },
    [push, ledgerId]
  );

  const isEmpty = isTaskQueueEmpty(stats, groupedItems);

  const handleDismissAll = useCallback(() => {
    const ids = failedWithoutSourceDoc.map((item) => item.id);
    if (ids.length > 0) {
      batchDismiss.mutate(ids);
    }
  }, [failedWithoutSourceDoc, batchDismiss]);

  const handleRetrySuccess = useCallback(async () => {
    await queryClient.invalidateQueries({ predicate: invalidateTaskQueue(ledgerId) });
  }, [queryClient, ledgerId]);

  return {
    isPendingCollapsed,
    isRunningCollapsed,
    isFailedCollapsed,
    isAnomalyCollapsed,
    isCompletedCollapsed,
    retrySourceDocId,
    deleteConfirm,
    items,
    stats,
    isLoading,
    groupedItems,
    isEmpty,
    failedWithSourceDoc,
    failedWithoutSourceDoc,
    deleteSourceDocument,
    batchDelete,
    batchRetry,
    cancelTask,
    dismissTask,
    batchDismiss,
    setIsPendingCollapsed,
    setIsRunningCollapsed,
    setIsFailedCollapsed,
    setIsAnomalyCollapsed,
    setIsCompletedCollapsed,
    closeRetryDialog,
    closeDeleteConfirm,
    setRetrySourceDocId,
    setDeleteConfirm,
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
