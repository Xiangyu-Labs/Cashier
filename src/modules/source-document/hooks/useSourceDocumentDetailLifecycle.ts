"use client";

import { useCallback } from "react";
import type { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";
import type { PendingChanges } from "@/modules/source-document/detail-types";
import type { SourceDocumentDetailState } from "./useSourceDocumentDetailState";

interface UseSourceDocumentDetailLifecycleOptions {
  sourceDocument: SourceDocument | SourceDocumentLight | null;
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
  t: ReturnType<typeof useTranslations>;
}

export function useSourceDocumentDetailLifecycle({
  sourceDocument,
  state,
  onClose,
  onReload,
  onSaveAll,
  t,
}: UseSourceDocumentDetailLifecycleOptions) {
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
    isSelectionMode,
    clearSelection,
    unsavedGuard,
    setIsSaving,
    setIsReloading,
    setReloadError,
    setIsEditMode,
  } = state;

  const handleClose = useCallback(() => {
    if (busy) return;
    if (hasPendingChanges) unsavedGuard.requestLeave(null);
    else onClose();
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
    discardAllChanges,
    draftRevisionIdRef,
    hasRevisionConflict,
    onSaveAll,
    pendingChanges,
    pendingChangesCount,
    saveOperationIdRef,
    setIsSaving,
    sourceDocument?.activeRevisionId,
    t,
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
  }, [
    clearSelection,
    discardAllChanges,
    onReload,
    setIsReloading,
    setReloadError,
    state.isReloading,
  ]);

  return {
    handleClose,
    handleSaveAll,
    handleEnterEditMode,
    handleCancelEditMode,
    handleEditSave,
    handleSaveAllAndClose,
    handleDiscardAndClose,
    handleReload,
  };
}
