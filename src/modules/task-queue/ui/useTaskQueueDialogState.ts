"use client";

import { useCallback, useState } from "react";
import {
  EMPTY_TASK_QUEUE_DELETE_CONFIRM,
  type TaskQueueDeleteConfirmState,
} from "./taskQueueModal.types";

export function useTaskQueueDialogState() {
  const [retrySourceDocId, setRetrySourceDocId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<TaskQueueDeleteConfirmState>(
    EMPTY_TASK_QUEUE_DELETE_CONFIRM
  );

  const openSingleDeleteConfirm = useCallback((id: string, title: string, description: string) => {
    setDeleteConfirm({
      open: true,
      type: "single",
      id,
      title,
      description,
    });
  }, []);

  const openDeleteAllConfirm = useCallback((title: string, description: string) => {
    setDeleteConfirm({
      open: true,
      type: "all",
      id: null,
      title,
      description,
    });
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirm((previous) => ({ ...previous, open: false }));
  }, []);

  const closeRetryDialog = useCallback(() => {
    setRetrySourceDocId(null);
  }, []);

  return {
    retrySourceDocId,
    deleteConfirm,
    setRetrySourceDocId,
    setDeleteConfirm,
    openSingleDeleteConfirm,
    openDeleteAllConfirm,
    closeDeleteConfirm,
    closeRetryDialog,
  };
}
