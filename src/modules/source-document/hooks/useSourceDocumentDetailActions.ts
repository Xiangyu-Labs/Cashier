"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import type { useTranslations } from "next-intl";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type {
  SourceDocument,
  SourceDocumentLight,
  SplitSourceDocumentInput,
  SplitSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import { openLedgerDetail } from "@/lib/navigation/ledger-detail-navigation";
import { useSaveAndContinueGate } from "./useSaveAndContinueGate";
import type { AddEntryData } from "./useSourceDocumentDetailMutations";
import type { PendingChanges } from "./usePendingChanges";
import type { SourceDocumentDetailState } from "./useSourceDocumentDetailState";

interface UseSourceDocumentDetailActionsOptions {
  ledgerId: string;
  sourceDocument: SourceDocument | SourceDocumentLight | null;
  ledgerEntries: LedgerEntry[];
  state: SourceDocumentDetailState;
  onClose: () => void;
  onReload?: (() => Promise<void>) | undefined;
  onSaveAll?:
    | ((input: {
        expectedRevisionId: string;
        operationId: string;
        changes: PendingChanges;
      }) => Promise<unknown>)
    | undefined;
  onSplit?:
    | ((
        input: Omit<SplitSourceDocumentInput, "sourceDocumentId">
      ) => Promise<SplitSourceDocumentResultDto>)
    | undefined;
  onBatchUpdate: (
    ids: string[],
    data: {
      categoryId?: string | null;
      currency?: string;
      entryDate?: string;
      description?: string;
    }
  ) => Promise<{ affectedCount: number } | undefined>;
  onBatchDeleteEntries: (ids: string[]) => Promise<string[]>;
  onAddEntry?: ((data: AddEntryData) => Promise<unknown>) | undefined;
  onDeleteEntry?: ((entryId: string) => Promise<unknown>) | undefined;
  onDelete?: (() => void | Promise<void>) | undefined;
  readOnly: boolean;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}

/** Owns every mutation-triggering handler for the source document detail modal. */
export function useSourceDocumentDetailActions({
  ledgerId,
  sourceDocument,
  ledgerEntries,
  state,
  onClose,
  onReload,
  onSaveAll,
  onSplit,
  onBatchUpdate,
  onBatchDeleteEntries,
  onAddEntry,
  onDeleteEntry,
  onDelete,
  readOnly,
  t,
  tCommon,
}: UseSourceDocumentDetailActionsOptions) {
  const splitIdentityRef = useRef<{
    operationId: string;
    newSourceDocumentId: string;
    payloadKey: string;
  } | null>(null);

  const {
    busy,
    interactionDisabled,
    hasPendingChanges,
    hasRevisionConflict,
    draftRevisionIdRef,
    saveOperationIdRef,
    pendingChanges,
    pendingChangesCount,
    discardAllChanges,
    selectedIds,
    isSelectionMode,
    clearSelection,
    retainSelection,
    setSelectionMode,
    unsavedGuard,
    setIsSaving,
    setIsDeleting,
    setIsReloading,
    setReloadError,
    setIsEditMode,
    setIsSplitting,
    setShowSplitDialog,
    setShowAddEntryDialog,
    setPendingDeleteEntryId,
    setShowBatchModePendingConfirm,
    setShowBatchDeleteConfirm,
  } = state;

  const handleClose = useCallback(() => {
    if (busy) return;
    if (hasPendingChanges) {
      unsavedGuard.requestLeave(null);
    } else {
      onClose();
    }
  }, [busy, hasPendingChanges, onClose, unsavedGuard]);

  const handleSaveAll = useCallback(async (): Promise<boolean> => {
    if (busy) return false;
    const expectedRevisionId = draftRevisionIdRef.current ?? sourceDocument?.activeRevisionId;
    if (
      expectedRevisionId == null ||
      expectedRevisionId === "" ||
      onSaveAll == null ||
      hasRevisionConflict
    ) {
      toast.error(t("saveAllFailed"));
      return false;
    }
    setIsSaving(true);
    try {
      saveOperationIdRef.current ??= crypto.randomUUID();
      await onSaveAll({
        expectedRevisionId,
        operationId: saveOperationIdRef.current,
        changes: pendingChanges,
      });
      saveOperationIdRef.current = null;
      discardAllChanges();
      toast.success(t("saveAllSuccess", { count: pendingChangesCount }));
      return true;
    } catch (error) {
      console.error("Failed to save changes:", error);
      toast.error(t("saveAllFailed"));
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [
    busy,
    draftRevisionIdRef,
    sourceDocument?.activeRevisionId,
    hasRevisionConflict,
    saveOperationIdRef,
    pendingChanges,
    onSaveAll,
    pendingChangesCount,
    t,
    discardAllChanges,
    setIsSaving,
  ]);

  const handleEnterEditMode = useCallback(() => {
    if (interactionDisabled || isSelectionMode) return;
    setIsEditMode(true);
  }, [interactionDisabled, isSelectionMode, setIsEditMode]);

  const handleCancelEditMode = useCallback(() => {
    if (busy) return;
    discardAllChanges();
    setIsEditMode(false);
  }, [busy, discardAllChanges, setIsEditMode]);

  const handleEditSave = useCallback(async (): Promise<boolean> => {
    const saved = await handleSaveAll();
    if (saved) setIsEditMode(false);
    return saved;
  }, [handleSaveAll, setIsEditMode]);

  const enterBatchSelectionMode = useCallback(() => {
    discardAllChanges();
    setIsEditMode(false);
    setSelectionMode(true);
  }, [discardAllChanges, setIsEditMode, setSelectionMode]);

  const handleToggleSelectionMode = useCallback(() => {
    if (busy || readOnly || sourceDocument == null || ledgerEntries.length === 0) return;
    if (isSelectionMode) {
      setSelectionMode(false);
      return;
    }
    if (!state.isEditMode || !hasPendingChanges) {
      enterBatchSelectionMode();
      return;
    }
    setShowBatchModePendingConfirm(true);
  }, [
    busy,
    enterBatchSelectionMode,
    hasPendingChanges,
    isSelectionMode,
    ledgerEntries.length,
    readOnly,
    setSelectionMode,
    setShowBatchModePendingConfirm,
    sourceDocument,
    state.isEditMode,
  ]);

  const handleSaveAndEnterBatchMode = useCallback(async () => {
    const saved = await handleSaveAll();
    if (!saved) return false;
    setIsEditMode(false);
    setSelectionMode(true);
    setShowBatchModePendingConfirm(false);
    return true;
  }, [handleSaveAll, setIsEditMode, setSelectionMode, setShowBatchModePendingConfirm]);

  const handleDiscardAndEnterBatchMode = useCallback(() => {
    enterBatchSelectionMode();
    setShowBatchModePendingConfirm(false);
  }, [enterBatchSelectionMode, setShowBatchModePendingConfirm]);

  const handleSaveAllAndClose = useCallback(async () => {
    const saved = await handleSaveAll();
    if (!saved) return false;
    const continueNavigation = unsavedGuard.resolveLeave();
    if (continueNavigation != null) continueNavigation();
    else onClose();
    return true;
  }, [handleSaveAll, onClose, unsavedGuard]);

  const handleDiscardAndClose = useCallback(() => {
    discardAllChanges();
    const continueNavigation = unsavedGuard.resolveLeave();
    if (continueNavigation != null) continueNavigation();
    else onClose();
  }, [discardAllChanges, onClose, unsavedGuard]);

  const handleReload = useCallback(async () => {
    if (onReload == null || state.isReloading) return false;
    setIsReloading(true);
    setReloadError(false);
    try {
      await onReload();
      discardAllChanges();
      clearSelection();
      return true;
    } catch {
      setReloadError(true);
      return false;
    } finally {
      setIsReloading(false);
    }
  }, [clearSelection, discardAllChanges, onReload, setIsReloading, setReloadError, state.isReloading]);

  const { requestAction, confirmOpen, setConfirmOpen, confirmSaveAndContinue, confirmDiscardAndContinue } =
    useSaveAndContinueGate({
      disabled: interactionDisabled || hasRevisionConflict,
      hasPendingChanges,
      onSave: handleSaveAll,
      onDiscard: discardAllChanges,
    });
  const saveAndContinueGate = {
    confirmOpen,
    setConfirmOpen,
    confirmSaveAndContinue,
    confirmDiscardAndContinue,
  };

  const performBatchCategory = async (categoryId: string | null) => {
    if (selectedIds.length === 0 || busy) return;
    setIsSaving(true);
    try {
      const result = await onBatchUpdate(selectedIds, { categoryId });
      toast.success(t("batchUpdateSuccess", { count: result?.affectedCount ?? 0 }));
      clearSelection();
    } catch {
      toast.error(t("batchUpdateError"));
    } finally {
      setIsSaving(false);
    }
  };
  const handleBatchCategory = (categoryId: string | null) =>
    requestAction(() => performBatchCategory(categoryId));

  const performBatchCurrency = async (currency: string) => {
    if (selectedIds.length === 0 || busy) return;
    setIsSaving(true);
    try {
      const result = await onBatchUpdate(selectedIds, { currency });
      toast.success(t("batchUpdateSuccess", { count: result?.affectedCount ?? 0 }));
      clearSelection();
    } catch {
      toast.error(t("batchUpdateError"));
    } finally {
      setIsSaving(false);
    }
  };
  const handleBatchCurrency = (currency: string) =>
    requestAction(() => performBatchCurrency(currency));

  const handleBatchDelete = async () => {
    if (busy) return;
    setIsSaving(true);
    try {
      const failed = await onBatchDeleteEntries(selectedIds);
      if (failed.length === 0) clearSelection();
      else retainSelection(failed);
      toast.success(t("batchDeleteSuccess", { count: selectedIds.length - failed.length }));
      if (failed.length > 0) toast.error(t("batchDeletePartial", { count: failed.length }));
      setShowBatchDeleteConfirm(false);
    } catch {
      toast.error(t("batchDeleteError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenSplit = () => {
    if (busy || selectedIds.length === 0) return;
    if (selectedIds.length >= ledgerEntries.length) {
      toast.error(t("splitKeepOne"));
      return;
    }
    requestAction(() => setShowSplitDialog(true));
  };

  const handleSplit = async (entryDate: string) => {
    const expectedRevisionId = sourceDocument?.activeRevisionId;
    if (expectedRevisionId == null || expectedRevisionId === "" || onSplit == null) {
      toast.error(t("splitFailed"));
      return;
    }
    const payloadKey = JSON.stringify({
      expectedRevisionId,
      ledgerEntryIds: [...selectedIds].sort(),
      entryDate,
    });
    if (splitIdentityRef.current?.payloadKey !== payloadKey) {
      splitIdentityRef.current = {
        operationId: crypto.randomUUID(),
        newSourceDocumentId: crypto.randomUUID(),
        payloadKey,
      };
    }
    setIsSplitting(true);
    try {
      const result = await onSplit({
        expectedRevisionId,
        operationId: splitIdentityRef.current.operationId,
        newSourceDocumentId: splitIdentityRef.current.newSourceDocumentId,
        ledgerEntryIds: selectedIds,
        entryDate,
      });
      splitIdentityRef.current = null;
      setShowSplitDialog(false);
      clearSelection();
      toast.success(t("splitSuccess", { count: result.movedEntryCount }), {
        action: {
          label: t("viewSplitBill"),
          onClick: () =>
            openLedgerDetail({
              type: "source-document",
              id: result.splitSourceDocumentId,
              ledgerId,
            }),
        },
      });
    } catch {
      toast.error(t("splitFailed"));
    } finally {
      setIsSplitting(false);
    }
  };

  const handleOpenAddEntry = () => requestAction(() => setShowAddEntryDialog(true));

  const handleAddEntrySubmit = async (data: AddEntryData): Promise<boolean> => {
    if (onAddEntry == null || busy) return false;
    setIsSaving(true);
    try {
      await onAddEntry(data);
      toast.success(t("addEntrySuccess"));
      return true;
    } catch {
      toast.error(t("addEntryError"));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEntry = async (entryId: string): Promise<boolean> => {
    if (onDeleteEntry == null || busy) return false;
    setIsSaving(true);
    try {
      await onDeleteEntry(entryId);
      toast.success(tCommon("deleteSuccess"));
      return true;
    } catch {
      toast.error(tCommon("deleteFailed"));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestDeleteEntry = (entryId: string) =>
    requestAction(() => setPendingDeleteEntryId(entryId));

  const handleDeleteDocument = async () => {
    if (interactionDisabled) return;
    setIsDeleting(true);
    try {
      await onDelete?.();
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    handleClose,
    handleSaveAll,
    handleEnterEditMode,
    handleCancelEditMode,
    handleEditSave,
    handleToggleSelectionMode,
    handleSaveAndEnterBatchMode,
    handleDiscardAndEnterBatchMode,
    handleSaveAllAndClose,
    handleDiscardAndClose,
    handleReload,
    requestAction,
    saveAndContinueGate,
    handleBatchCategory,
    handleBatchCurrency,
    handleBatchDelete,
    handleOpenSplit,
    handleSplit,
    handleOpenAddEntry,
    handleAddEntrySubmit,
    handleDeleteEntry,
    handleRequestDeleteEntry,
    handleDeleteDocument,
  };
}
