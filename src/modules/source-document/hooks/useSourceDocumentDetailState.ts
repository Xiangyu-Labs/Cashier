"use client";

import { useState } from "react";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";
import { usePendingChanges } from "./usePendingChanges";
import { useSourceDocumentRevisionGuard } from "./useSourceDocumentRevisionGuard";
import { useSelection } from "@/hooks/use-selection";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { ledgerDetailLeaveGuardKey } from "@/lib/navigation/ledger-detail-key";

interface UseSourceDocumentDetailStateOptions {
  ledgerId: string;
  sourceDocument: SourceDocument | SourceDocumentLight | null;
  ledgerEntries: LedgerEntry[];
  open: boolean;
  isAccepting: boolean;
  isAbandoning: boolean;
  isCancelling: boolean;
}

/** Owns the modal's draft, selection, busy, and dialog-visibility state. */
export function useSourceDocumentDetailState({
  ledgerId,
  sourceDocument,
  ledgerEntries,
  open,
  isAccepting,
  isAbandoning,
  isCancelling,
}: UseSourceDocumentDetailStateOptions) {
  const pendingChangesState = usePendingChanges({ sourceDocument, ledgerEntries });
  const { hasPendingChanges, pendingChanges } = pendingChangesState;

  const selectionState = useSelection({ allIds: ledgerEntries.map((e) => e.id) });

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadError, setReloadError] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setIsEditMode(false);
  }

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showRetryDialog, setShowRetryDialog] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [showAddEntryDialog, setShowAddEntryDialog] = useState(false);
  const [pendingDeleteEntryId, setPendingDeleteEntryId] = useState<string | null>(null);
  const [showBatchModePendingConfirm, setShowBatchModePendingConfirm] = useState(false);

  const busy =
    isSaving ||
    isDeleting ||
    isRetrying ||
    isSplitting ||
    isReloading ||
    isAccepting ||
    isAbandoning ||
    isCancelling;
  const interactionDisabled = busy || sourceDocument == null;

  const revisionGuard = useSourceDocumentRevisionGuard({
    hasPendingChanges,
    activeRevisionId: sourceDocument?.activeRevisionId,
  });

  const unsavedGuard = useUnsavedChangesGuard({
    key: ledgerDetailLeaveGuardKey("source-document", ledgerId, sourceDocument?.id ?? ""),
    hasUnsavedChanges: sourceDocument?.id != null && hasPendingChanges,
  });

  const displayTitle = pendingChanges.sourceDoc.title ?? sourceDocument?.title ?? "";
  const splitInitialDate =
    sourceDocument?.entryDate ?? sourceDocument?.createdAt.slice(0, 10) ?? "";

  return {
    ...pendingChangesState,
    ...selectionState,
    isSaving,
    setIsSaving,
    isDeleting,
    setIsDeleting,
    isRetrying,
    setIsRetrying,
    isSplitting,
    setIsSplitting,
    isReloading,
    setIsReloading,
    reloadError,
    setReloadError,
    isEditMode,
    setIsEditMode,
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
    busy,
    interactionDisabled,
    ...revisionGuard,
    unsavedGuard,
    displayTitle,
    splitInitialDate,
  };
}

export type SourceDocumentDetailState = ReturnType<typeof useSourceDocumentDetailState>;
