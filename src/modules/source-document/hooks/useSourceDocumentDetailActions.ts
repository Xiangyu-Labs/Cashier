"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import type { useTranslations } from "next-intl";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type {
  SourceDocument,
  SourceDocumentLight,
  SplitSourceDocumentInput,
  SplitSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import { useSaveAndContinueGate } from "./useSaveAndContinueGate";
import type { AddEntryData } from "./useSourceDocumentDetailMutations";
import type { PendingChanges } from "./usePendingChanges";
import type { SourceDocumentDetailState } from "./useSourceDocumentDetailState";
import { useSourceDocumentBatchActions } from "./useSourceDocumentBatchActions";
import { useSourceDocumentEntryActions } from "./useSourceDocumentEntryActions";

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
    } catch {
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

  const {
    handleToggleSelectionMode,
    handleSaveAndEnterBatchMode,
    handleDiscardAndEnterBatchMode,
    performBatchCategory,
    performBatchCurrency,
    handleBatchDelete,
  } = useSourceDocumentBatchActions({
    busy,
    readOnly,
    sourceDocument,
    ledgerEntries,
    isSelectionMode,
    isEditMode: state.isEditMode,
    hasPendingChanges,
    selectedIds,
    setSelectionMode,
    setIsEditMode,
    setShowBatchModePendingConfirm,
    setShowBatchDeleteConfirm,
    setIsSaving,
    discardAllChanges,
    clearSelection,
    retainSelection,
    handleSaveAll,
    onBatchUpdate,
    onBatchDeleteEntries,
    t,
  });
  const handleBatchCategory = useCallback(
    (categoryId: string | null) => requestAction(() => performBatchCategory(categoryId)),
    [requestAction, performBatchCategory]
  );
  const handleBatchCurrency = useCallback(
    (currency: string) => requestAction(() => performBatchCurrency(currency)),
    [requestAction, performBatchCurrency]
  );

  const {
    handleOpenSplit,
    handleSplit,
    handleOpenAddEntry,
    handleAddEntrySubmit,
    handleDeleteEntry,
    handleRequestDeleteEntry,
    handleDeleteDocument,
  } = useSourceDocumentEntryActions({
    ledgerId,
    sourceDocument,
    busy,
    interactionDisabled,
    selectedIds,
    ledgerEntries,
    requestAction,
    setIsSaving,
    setIsSplitting,
    setIsDeleting,
    setShowSplitDialog,
    setShowAddEntryDialog,
    setPendingDeleteEntryId,
    clearSelection,
    onSplit,
    onAddEntry,
    onDeleteEntry,
    onDelete,
    t,
    tCommon,
  });

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
