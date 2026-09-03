"use client";

import { useState } from "react";

export function useSourceDocumentDetailDialogState() {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showRetryDialog, setShowRetryDialog] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [showAddEntryDialog, setShowAddEntryDialog] = useState(false);
  const [pendingDeleteEntryId, setPendingDeleteEntryId] = useState<string | null>(null);
  const [showBatchModePendingConfirm, setShowBatchModePendingConfirm] = useState(false);

  return {
    showDeleteConfirm,
    setShowDeleteConfirm,
    showBatchDeleteConfirm,
    setShowBatchDeleteConfirm,
    showRetryDialog,
    setShowRetryDialog,
    showSplitDialog,
    setShowSplitDialog,
    showAddEntryDialog,
    setShowAddEntryDialog,
    pendingDeleteEntryId,
    setPendingDeleteEntryId,
    showBatchModePendingConfirm,
    setShowBatchModePendingConfirm,
  };
}
