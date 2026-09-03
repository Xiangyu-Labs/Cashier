"use client";

import { useCallback, useState } from "react";
import type { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useConfirmGate } from "@/hooks/use-confirm-gate";
import { useSelection } from "@/hooks/use-selection";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { ledgerDetailLeaveGuardKey } from "@/lib/navigation/ledger-detail-key";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type {
  SourceDocument,
  SourceDocumentLight,
  SplitSourceDocumentInput,
  SplitSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import type { PendingChanges } from "@/modules/source-document/detail-types";
import { usePendingChanges } from "./usePendingChanges";
import { useSourceDocumentEntryBatchActions } from "./useSourceDocumentEntryBatchActions";
import { useSourceDocumentEntryActions } from "./useSourceDocumentEntryActions";
import type { AddEntryData } from "./useSourceDocumentDetailMutations";
import { useSourceDocumentRevisionGuard } from "./useSourceDocumentRevisionGuard";

interface UseSourceDocumentDetailControllerOptions {
  ledgerId: string;
  sourceDocument: SourceDocument | SourceDocumentLight | null;
  ledgerEntries: LedgerEntry[];
  open: boolean;
  isAccepting: boolean;
  isAbandoning: boolean;
  isCancelling: boolean;
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

export function useSourceDocumentDetailController({
  ledgerId,
  sourceDocument,
  ledgerEntries,
  open,
  isAccepting,
  isAbandoning,
  isCancelling,
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
}: UseSourceDocumentDetailControllerOptions) {
  const pending = usePendingChanges({ sourceDocument, ledgerEntries });
  const selection = useSelection({ allIds: ledgerEntries.map((entry) => entry.id) });
  const revision = useSourceDocumentRevisionGuard({
    hasPendingChanges: pending.hasPendingChanges,
    activeRevisionId: sourceDocument?.activeRevisionId,
  });

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
    const expectedRevisionId =
      revision.draftRevisionIdRef.current ?? sourceDocument?.activeRevisionId;
    if (
      expectedRevisionId == null ||
      expectedRevisionId === "" ||
      onSaveAll == null ||
      revision.hasRevisionConflict
    ) {
      toast.error(t("saveAllFailed"));
      return false;
    }
    setIsSaving(true);
    try {
      revision.saveOperationIdRef.current ??= crypto.randomUUID();
      await onSaveAll({
        expectedRevisionId,
        operationId: revision.saveOperationIdRef.current,
        changes: pending.pendingChanges,
      });
      revision.saveOperationIdRef.current = null;
      pending.discardAllChanges();
      toast.success(t("saveAllSuccess", { count: pending.pendingChangesCount }));
      return true;
    } catch {
      toast.error(t("saveAllFailed"));
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [busy, onSaveAll, pending, revision, sourceDocument?.activeRevisionId, t]);

  const handleEnterEditMode = useCallback(() => {
    if (interactionDisabled || selection.isSelectionMode) return;
    setIsEditMode(true);
  }, [interactionDisabled, selection.isSelectionMode]);

  const handleCancelEditMode = useCallback(() => {
    if (busy) return;
    pending.discardAllChanges();
    setIsEditMode(false);
  }, [busy, pending]);

  const handleEditSave = useCallback(async (): Promise<boolean> => {
    const saved = await handleSaveAll();
    if (saved) setIsEditMode(false);
    return saved;
  }, [handleSaveAll]);

  const handleSaveAllAndClose = useCallback(async () => {
    const saved = await handleSaveAll();
    if (!saved) return false;
    const continueNavigation = unsavedGuard.resolveLeave();
    if (continueNavigation != null) continueNavigation();
    else onClose();
    return true;
  }, [handleSaveAll, onClose, unsavedGuard]);

  const handleDiscardAndClose = useCallback(() => {
    pending.discardAllChanges();
    const continueNavigation = unsavedGuard.resolveLeave();
    if (continueNavigation != null) continueNavigation();
    else onClose();
  }, [onClose, pending, unsavedGuard]);

  const handleReload = useCallback(async () => {
    if (onReload == null || isReloading) return false;
    setIsReloading(true);
    setReloadError(false);
    try {
      await onReload();
      pending.discardAllChanges();
      selection.clearSelection();
      return true;
    } catch {
      setReloadError(true);
      return false;
    } finally {
      setIsReloading(false);
    }
  }, [isReloading, onReload, pending, selection]);

  const {
    confirmOpen: continueConfirmOpen,
    setConfirmOpen: setContinueConfirmOpen,
    requestConfirmation: requestContinueConfirmation,
    resolveConfirmation: resolveContinueConfirmation,
  } = useConfirmGate<() => void | Promise<void>>();
  const requestAction = useCallback(
    (action: () => void | Promise<void>) => {
      if (interactionDisabled || revision.hasRevisionConflict) return;
      if (pending.hasPendingChanges) {
        requestContinueConfirmation(action);
        return;
      }
      void action();
    },
    [
      interactionDisabled,
      pending.hasPendingChanges,
      requestContinueConfirmation,
      revision.hasRevisionConflict,
    ]
  );
  const confirmSaveAndContinue = useCallback(async () => {
    const saved = await handleSaveAll();
    if (!saved) return false;
    const action = resolveContinueConfirmation();
    await action?.();
    return true;
  }, [handleSaveAll, resolveContinueConfirmation]);
  const confirmDiscardAndContinue = useCallback(async () => {
    pending.discardAllChanges();
    const action = resolveContinueConfirmation();
    await action?.();
  }, [pending, resolveContinueConfirmation]);

  const {
    handleToggleSelectionMode,
    handleSaveAndEnterBatchMode,
    handleDiscardAndEnterBatchMode,
    performBatchCategory,
    performBatchCurrency,
    handleBatchDelete,
  } = useSourceDocumentEntryBatchActions({
    busy,
    sourceDocument,
    ledgerEntries,
    isSelectionMode: selection.isSelectionMode,
    isEditMode,
    hasPendingChanges: pending.hasPendingChanges,
    selectedIds: selection.selectedIds,
    setSelectionMode: selection.setSelectionMode,
    setIsEditMode,
    setShowBatchModePendingConfirm,
    setShowBatchDeleteConfirm,
    setIsSaving,
    discardAllChanges: pending.discardAllChanges,
    clearSelection: selection.clearSelection,
    retainSelection: selection.retainSelection,
    handleSaveAll,
    onBatchUpdate,
    onBatchDeleteEntries,
    t,
  });
  const handleBatchCategory = useCallback(
    (categoryId: string | null) => requestAction(() => performBatchCategory(categoryId)),
    [performBatchCategory, requestAction]
  );
  const handleBatchCurrency = useCallback(
    (currency: string) => requestAction(() => performBatchCurrency(currency)),
    [performBatchCurrency, requestAction]
  );

  const entryActions = useSourceDocumentEntryActions({
    ledgerId,
    sourceDocument,
    busy,
    interactionDisabled,
    selectedIds: selection.selectedIds,
    ledgerEntries,
    requestAction,
    setIsSaving,
    setIsSplitting,
    setIsDeleting,
    setShowSplitDialog,
    setShowAddEntryDialog,
    setPendingDeleteEntryId,
    clearSelection: selection.clearSelection,
    onSplit,
    onAddEntry,
    onDeleteEntry,
    onDelete,
    t,
    tCommon,
  });

  return {
    editor: {
      pendingChanges: pending.pendingChanges,
      hasPendingChanges: pending.hasPendingChanges,
      pendingChangesCount: pending.pendingChangesCount,
      handleSourceDocChange: pending.handleSourceDocChange,
      handleEntryChange: pending.handleEntryChange,
      isEditMode,
      displayTitle: pending.pendingChanges.sourceDoc.title ?? sourceDocument?.title ?? "",
      splitInitialDate: sourceDocument?.entryDate ?? sourceDocument?.createdAt.slice(0, 10) ?? "",
    },
    selection: {
      selectedIds: selection.selectedIds,
      isSelectionMode: selection.isSelectionMode,
      isAllSelected: selection.isAllSelected,
      handleSelect: selection.handleSelect,
      handleSelectAll: selection.handleSelectAll,
    },
    status: {
      busy,
      interactionDisabled,
      isSaving,
      isSplitting,
      isReloading,
      reloadError,
      hasRevisionConflict: revision.hasRevisionConflict,
      setIsRetrying,
    },
    dialogs: {
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
      unsavedGuard,
      saveAndContinueGate: {
        confirmOpen: continueConfirmOpen,
        setConfirmOpen: setContinueConfirmOpen,
        confirmSaveAndContinue,
        confirmDiscardAndContinue,
      },
    },
    actions: {
      handleClose,
      handleEnterEditMode,
      handleCancelEditMode,
      handleEditSave,
      handleSaveAndEnterBatchMode,
      handleDiscardAndEnterBatchMode,
      handleToggleSelectionMode,
      handleSaveAllAndClose,
      handleDiscardAndClose,
      handleReload,
      requestAction,
      handleBatchCategory,
      handleBatchCurrency,
      handleBatchDelete,
      ...entryActions,
    },
  };
}
