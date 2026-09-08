"use client";

import { useCallback, useState } from "react";
import type { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { ledgerDetailLeaveGuardKey } from "@/lib/navigation/ledger-detail-key";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";
import type { PendingChanges } from "@/modules/source-document/detail-types";
import { SourceDocumentStaleCommandError } from "@/modules/source-document/command-results";
import { usePendingChanges } from "./usePendingChanges";
import { useSourceDocumentRevisionGuard } from "./useSourceDocumentRevisionGuard";

interface UseSourceDocumentDetailSessionOptions {
  ledgerId: string;
  sourceDocument: SourceDocument | SourceDocumentLight | null;
  ledgerEntries: LedgerEntry[];
  open: boolean;
  externalPending: boolean;
  onClose: () => void;
  onReload?: (() => Promise<void>) | undefined;
  onSaveAll?:
    | ((
        input: { expectedVersion: number; changes: PendingChanges },
        onCommitted?: () => void
      ) => Promise<void>)
    | undefined;
  clearSelection: () => void;
  t: ReturnType<typeof useTranslations>;
}

export function useSourceDocumentDetailSession({
  ledgerId,
  sourceDocument,
  ledgerEntries,
  open,
  externalPending,
  onClose,
  onReload,
  onSaveAll,
  clearSelection,
  t,
}: UseSourceDocumentDetailSessionOptions) {
  const pending = usePendingChanges({ sourceDocument, ledgerEntries });
  const [isEditMode, setIsEditMode] = useState(false);
  const revision = useSourceDocumentRevisionGuard({
    hasPendingChanges: pending.hasPendingChanges,
    isEditing: isEditMode,
    version: sourceDocument?.version,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadError, setReloadError] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setIsEditMode(false);
  }

  const busy =
    isSaving || isDeleting || isRetrying || isSplitting || isReloading || externalPending;
  const interactionDisabled = busy || sourceDocument == null;
  const unsavedGuard = useUnsavedChangesGuard({
    key: ledgerDetailLeaveGuardKey("source-document", ledgerId, sourceDocument?.id ?? ""),
    hasUnsavedChanges: sourceDocument?.id != null && pending.hasPendingChanges,
  });

  const handleClose = useCallback(() => {
    if (busy) return;
    if (pending.hasPendingChanges) unsavedGuard.requestLeave(null);
    else onClose();
  }, [busy, onClose, pending.hasPendingChanges, unsavedGuard]);

  const handleSaveAll = useCallback(async (): Promise<boolean> => {
    if (busy) return false;
    const expectedVersion = revision.baseVersionRef.current ?? sourceDocument?.version;
    if (revision.hasVersionConflict) {
      toast.error(t("saveConflict"));
      return false;
    }
    if (expectedVersion == null || onSaveAll == null) {
      toast.error(t("saveAllFailed"));
      return false;
    }
    setIsSaving(true);
    try {
      const committed = () => {
        pending.discardAllChanges();
        setIsEditMode(false);
      };
      await onSaveAll(
        {
          expectedVersion,
          changes: pending.pendingChanges,
        },
        committed
      );
      committed();
      toast.success(t("saveAllSuccess", { count: pending.pendingChangesCount }));
      return true;
    } catch (error) {
      // Stale is a distinct outcome from a genuine failure: the pending edits
      // are preserved either way (no discardAllChanges above), but the
      // message tells the user their edits are based on outdated data rather
      // than implying the save itself failed.
      toast.error(
        error instanceof SourceDocumentStaleCommandError ? t("saveConflict") : t("saveAllFailed")
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [busy, onSaveAll, pending, revision, sourceDocument?.version, t]);

  const handleReload = useCallback(async () => {
    if (onReload == null || isReloading) return false;
    setIsReloading(true);
    setReloadError(false);
    try {
      await onReload();
      pending.discardAllChanges();
      clearSelection();
      return true;
    } catch {
      setReloadError(true);
      return false;
    } finally {
      setIsReloading(false);
    }
  }, [clearSelection, isReloading, onReload, pending]);

  const handleEnterEditMode = useCallback(() => {
    if (!interactionDisabled) setIsEditMode(true);
  }, [interactionDisabled]);
  const handleCancelEditMode = useCallback(() => {
    if (busy) return;
    const cancel = () => {
      pending.discardAllChanges();
      setIsEditMode(false);
      void handleReload();
    };
    if (pending.hasPendingChanges) unsavedGuard.requestLeave(cancel);
    else cancel();
  }, [busy, pending, unsavedGuard, handleReload]);
  const handleEditSave = useCallback(async () => {
    const saved = await handleSaveAll();
    if (saved) setIsEditMode(false);
    return saved;
  }, [handleSaveAll]);
  const handleDiscardAndClose = useCallback(() => {
    pending.discardAllChanges();
    const continueNavigation = unsavedGuard.resolveLeave();
    if (continueNavigation != null) continueNavigation();
    else onClose();
  }, [onClose, pending, unsavedGuard]);

  return {
    pending,
    revision,
    isEditMode,
    setIsEditMode,
    busy,
    interactionDisabled,
    isSaving,
    setIsSaving,
    isDeleting,
    setIsDeleting,
    isRetrying,
    setIsRetrying,
    isSplitting,
    setIsSplitting,
    isReloading,
    reloadError,
    unsavedGuard,
    handleClose,
    handleSaveAll,
    handleReload,
    handleEnterEditMode,
    handleCancelEditMode,
    handleEditSave,
    handleDiscardAndClose,
  };
}
