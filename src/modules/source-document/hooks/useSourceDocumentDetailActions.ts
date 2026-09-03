"use client";

import { useCallback } from "react";
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
import type { PendingChanges } from "@/modules/source-document/detail-types";
import type { SourceDocumentDetailState } from "./useSourceDocumentDetailState";
import { useSourceDocumentBatchActions } from "./useSourceDocumentBatchActions";
import { useSourceDocumentEntryActions } from "./useSourceDocumentEntryActions";
import { useSourceDocumentDetailLifecycle } from "./useSourceDocumentDetailLifecycle";

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
  t,
  tCommon,
}: UseSourceDocumentDetailActionsOptions) {
  const {
    busy,
    interactionDisabled,
    hasRevisionConflict,
    discardAllChanges,
    selectedIds,
    isSelectionMode,
    clearSelection,
    retainSelection,
    setSelectionMode,
    setIsSaving,
    setIsDeleting,
    setIsEditMode,
    setIsSplitting,
    setShowSplitDialog,
    setShowAddEntryDialog,
    setPendingDeleteEntryId,
    setShowBatchModePendingConfirm,
    setShowBatchDeleteConfirm,
  } = state;

  const {
    handleClose,
    handleSaveAll,
    handleEnterEditMode,
    handleCancelEditMode,
    handleEditSave,
    handleSaveAllAndClose,
    handleDiscardAndClose,
    handleReload,
  } = useSourceDocumentDetailLifecycle({
    sourceDocument,
    state,
    onClose,
    onReload,
    onSaveAll,
    t,
  });

  const { hasPendingChanges } = state;

  const {
    requestAction,
    confirmOpen,
    setConfirmOpen,
    confirmSaveAndContinue,
    confirmDiscardAndContinue,
  } = useSaveAndContinueGate({
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
