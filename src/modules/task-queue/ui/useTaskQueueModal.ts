"use client";
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
import { useTaskQueueModalActions } from "./useTaskQueueModalActions";
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
  setIsPendingCollapsed: (value: boolean) => void;
  setIsRunningCollapsed: (value: boolean) => void;
  setIsFailedCollapsed: (value: boolean) => void;
  setIsAnomalyCollapsed: (value: boolean) => void;
  setIsCompletedCollapsed: (value: boolean) => void;
  closeRetryDialog: () => void;
  closeDeleteConfirm: () => void;
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
  const mutations = useTaskQueueMutations(ledgerId);
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
    openSingleDeleteConfirm,
    openDeleteAllConfirm,
    closeDeleteConfirm,
    closeRetryDialog,
  } = dialogState;

  const groupedItems = useMemo(() => groupTaskQueueItems(items), [items]);
  const { withSourceDoc: failedWithSourceDoc, withoutSourceDoc: failedWithoutSourceDoc } =
    useMemo(() => partitionFailedItems(groupedItems.failed), [groupedItems.failed]);
  const push = useModalStackStore((state) => state.push);
  const isEmpty = isTaskQueueEmpty(stats, groupedItems);
  const actions = useTaskQueueModalActions({
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
  });

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
    setIsPendingCollapsed,
    setIsRunningCollapsed,
    setIsFailedCollapsed,
    setIsAnomalyCollapsed,
    setIsCompletedCollapsed,
    closeRetryDialog,
    closeDeleteConfirm,
    ...actions,
  };
}
