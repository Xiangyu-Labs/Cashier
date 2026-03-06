"use client";

import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { invalidateLedgerCache } from "@/lib/query-keys";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { useTaskQueue } from "./useTaskQueue";
import { useTaskQueueMutations } from "./useTaskQueueMutations";
import type { QueueItem } from "../../types";

export interface UseTaskQueueModalReturn {
  // State
  isPendingCollapsed: boolean;
  isRunningCollapsed: boolean;
  isFailedCollapsed: boolean;
  isAnomalyCollapsed: boolean;
  isCompletedCollapsed: boolean;
  retrySourceDocId: string | null;
  deleteConfirm: {
    open: boolean;
    type: "single" | "all" | null;
    id: string | null;
    title: string;
    description: string;
  };

  // Data
  items: QueueItem[];
  stats: ReturnType<typeof useTaskQueue>["stats"];
  isLoading: boolean;
  groupedItems: {
    pending: QueueItem[];
    running: QueueItem[];
    failed: QueueItem[];
    completed: QueueItem[];
    anomaly: QueueItem[];
  };
  isEmpty: boolean;
  failedWithSourceDoc: QueueItem[];
  failedWithoutSourceDoc: QueueItem[];

  // Mutations
  deleteSourceDocument: ReturnType<typeof useTaskQueueMutations>["deleteSourceDocument"];
  batchDelete: ReturnType<typeof useTaskQueueMutations>["batchDelete"];
  batchRetry: ReturnType<typeof useTaskQueueMutations>["batchRetry"];
  cancelTask: ReturnType<typeof useTaskQueueMutations>["cancelTask"];
  dismissTask: ReturnType<typeof useTaskQueueMutations>["dismissTask"];
  batchDismiss: ReturnType<typeof useTaskQueueMutations>["batchDismiss"];

  // Actions
  setIsPendingCollapsed: (value: boolean) => void;
  setIsRunningCollapsed: (value: boolean) => void;
  setIsFailedCollapsed: (value: boolean) => void;
  setIsAnomalyCollapsed: (value: boolean) => void;
  setIsCompletedCollapsed: (value: boolean) => void;
  setRetrySourceDocId: (id: string | null) => void;
  setDeleteConfirm: React.Dispatch<React.SetStateAction<{
    open: boolean;
    type: "single" | "all" | null;
    id: string | null;
    title: string;
    description: string;
  }>>;
  handleDeleteConfirmAction: () => void;
  handleRetry: (item: QueueItem) => void;
  handleDeleteSingle: (item: QueueItem) => void;
  handleDeleteAll: () => void;
  handleRetryAll: (status: 'failed' | 'anomaly') => void;
  handleCancel: (item: QueueItem) => void;
  handleDismiss: (item: QueueItem) => void;
  handleDismissAll: () => void;
  handleViewDetails: (item: QueueItem) => void;
  handleRetrySuccess: () => void;
}

export function useTaskQueueModal(ledgerId: string): UseTaskQueueModalReturn {
  const t = useTranslations("TaskQueue");
  const queryClient = useQueryClient();

  const { items, stats, isLoading } = useTaskQueue(ledgerId);
  const {
    deleteSourceDocument,
    batchDelete,
    batchRetry,
    cancelTask,
    dismissTask,
    batchDismiss,
  } = useTaskQueueMutations(ledgerId);

  const [isPendingCollapsed, setIsPendingCollapsed] = useState(false);
  const [isRunningCollapsed, setIsRunningCollapsed] = useState(false);
  const [isFailedCollapsed, setIsFailedCollapsed] = useState(false);
  const [isAnomalyCollapsed, setIsAnomalyCollapsed] = useState(false);
  const [isCompletedCollapsed, setIsCompletedCollapsed] = useState(true);

  const [retrySourceDocId, setRetrySourceDocId] = useState<string | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    type: "single" | "all" | null;
    id: string | null;
    title: string;
    description: string;
  }>({ open: false, type: null, id: null, title: "", description: "" });

  const groupedItems = useMemo(() => {
    const pending: QueueItem[] = [];
    const running: QueueItem[] = [];
    const failed: QueueItem[] = [];
    const completed: QueueItem[] = [];
    const anomaly: QueueItem[] = [];

    for (const item of items) {
      switch (item.status) {
        case "pending":
          pending.push(item);
          break;
        case "running":
          running.push(item);
          break;
        case "failed":
          failed.push(item);
          break;
        case "completed":
          completed.push(item);
          break;
        case "anomaly":
          anomaly.push(item);
          break;
      }
    }

    return { pending, running, failed, completed, anomaly };
  }, [items]);

  const handleDeleteConfirmAction = useCallback(() => {
    if (!deleteConfirm.type) return;

    if (deleteConfirm.type === "single" && deleteConfirm.id) {
      deleteSourceDocument.mutate(deleteConfirm.id, {
        onSuccess: () => setDeleteConfirm((prev) => ({ ...prev, open: false })),
      });
    } else if (deleteConfirm.type === "all") {
      const ids = groupedItems.failed
        .filter((item) => item.sourceDocumentId)
        .map((item) => item.sourceDocumentId!);
      batchDelete.mutate(ids, {
        onSuccess: () => setDeleteConfirm((prev) => ({ ...prev, open: false })),
      });
    }
  }, [deleteConfirm, deleteSourceDocument, batchDelete, groupedItems.failed]);

  const handleRetry = useCallback((item: QueueItem) => {
    if (item.sourceDocumentId) {
      setRetrySourceDocId(item.sourceDocumentId);
    }
  }, []);

  const handleDeleteSingle = useCallback(
    (item: QueueItem) => {
      if (!item.sourceDocumentId) return;

      setDeleteConfirm({
        open: true,
        type: "single",
        id: item.sourceDocumentId,
        title: t("deleteConfirmTitle"),
        description: t("deleteConfirmDesc"),
      });
    },
    [t]
  );

  const handleDeleteAll = useCallback(() => {
    setDeleteConfirm({
      open: true,
      type: "all",
      id: null,
      title: t("deleteAllConfirmTitle"),
      description: t("deleteAllConfirmDesc"),
    });
  }, [t]);

  const handleRetryAll = useCallback(
    (status: "failed" | "anomaly") => {
      const itemsToRetry = groupedItems[status].filter((item) => item.sourceDocumentId);
      const ids = itemsToRetry.map((item) => item.sourceDocumentId!);
      batchRetry.mutate(ids);
    },
    [groupedItems, batchRetry]
  );

  const handleCancel = useCallback(
    (item: QueueItem) => {
      if (item.taskId) {
        cancelTask.mutate(item.taskId);
      }
    },
    [cancelTask]
  );

  const handleDismiss = useCallback(
    (item: QueueItem) => {
      if (item.taskId) {
        dismissTask.mutate(item.taskId);
      }
    },
    [dismissTask]
  );

  const push = useModalStackStore((state) => state.push);

  const handleViewDetails = useCallback(
    (item: QueueItem) => {
      if (item.sourceDocumentId) {
        push({ type: "source-document", id: item.sourceDocumentId });
      }
    },
    [push]
  );

  const isEmpty = stats.total === 0 && groupedItems.completed.length === 0;

  const failedWithSourceDoc = groupedItems.failed.filter((item) => item.sourceDocumentId);
  const failedWithoutSourceDoc = groupedItems.failed.filter((item) => !item.sourceDocumentId);

  const handleDismissAll = useCallback(() => {
    const ids = failedWithoutSourceDoc.map((item) => item.id);
    if (ids.length > 0) {
      batchDismiss.mutate(ids);
    }
  }, [failedWithoutSourceDoc, batchDismiss]);

  const handleRetrySuccess = useCallback(() => {
    queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
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
    setRetrySourceDocId,
    setDeleteConfirm,
    handleDeleteConfirmAction,
    handleRetry,
    handleDeleteSingle,
    handleDeleteAll,
    handleRetryAll,
    handleCancel,
    handleDismiss,
    handleDismissAll,
    handleViewDetails,
    handleRetrySuccess,
  };
}
