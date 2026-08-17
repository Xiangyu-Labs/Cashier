"use client";
import type { LedgerEntry, EntryCategory } from "@/modules/ledger/contracts";
import type {
  SourceDocumentLight,
  SplitSourceDocumentInput,
  SplitSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import { useState, useEffect, memo, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { CheckCheck, RefreshCw, Trash2, ArrowLeft, X, Save, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AnomalyCode, ProcessingFailureCode } from "@/application/contracts";
import { AmountText } from "@/modules/currency/ui";
import { toStableAnomalyCode, toStableFailureCode } from "@/application/contracts";
import { toast } from "sonner";
import { SourceDocumentViewDetails } from "./SourceDocumentViewDetails";
import { usePendingChanges } from "@/modules/source-document/hooks";
import { useSelection } from "@/hooks/use-selection";
import { EditableField } from "@/components/ui/editable-field";
import { SourceDocumentEditRetryDialog } from "./SourceDocumentEditRetryDialog";
import { LedgerEntriesBatchActionToolbar } from "@/modules/ledger/ui/batch-action-toolbar";
import type { PendingChanges } from "@/modules/source-document/hooks/usePendingChanges";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";
import { useDiagnosticMessages } from "./use-diagnostic-messages";
import { SourceDocumentSplitDialog } from "./SourceDocumentSplitDialog";
import { openLedgerDetail } from "@/modules/workspace/ledger-detail-navigation";

interface SourceDocumentDetailModalProps {
  ledgerId: string;
  sourceDocument: SourceDocument | SourceDocumentLight | null;
  isLoading?: boolean;
  isLoadingImages?: boolean;
  loadError?: boolean;
  onReload?: () => Promise<void>;
  ledgerEntries: LedgerEntry[];
  categories: EntryCategory[];
  preferredCurrencies?: string[];
  mainCurrency?: string;
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  onExitComplete?: () => void;
  onSaveAll?: (input: {
    expectedRevisionId: string;
    operationId: string;
    changes: PendingChanges;
  }) => Promise<unknown>;
  onSplit?: (
    input: Omit<SplitSourceDocumentInput, "sourceDocumentId">
  ) => Promise<SplitSourceDocumentResultDto>;
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
  onDelete?: () => void | Promise<void>;
  // Recovery action callbacks
  onAcceptCandidate?: () => Promise<void>;
  onAbandonCandidate?: () => Promise<void>;
  onCancelProcessing?: () => Promise<void>;
  isAccepting?: boolean;
  isAbandoning?: boolean;
  isCancelling?: boolean;
  readOnly?: boolean;
  cachedImageUrls?: ReadonlyMap<string, string>;
}

export const SourceDocumentDetailModal = memo(function SourceDocumentDetailModal({
  ledgerId,
  sourceDocument,
  isLoading = false,
  isLoadingImages = false,
  loadError = false,
  onReload,
  ledgerEntries,
  categories,
  preferredCurrencies = [],
  mainCurrency: _mainCurrency = "CNY",
  open,
  onClose,
  onBack,
  onExitComplete,
  onSaveAll,
  onSplit,
  onBatchUpdate,
  onBatchDeleteEntries,
  onDelete,
  onAcceptCandidate,
  onAbandonCandidate,
  onCancelProcessing,
  isAccepting = false,
  isAbandoning = false,
  isCancelling = false,
  readOnly = false,
  cachedImageUrls,
}: SourceDocumentDetailModalProps) {
  const t = useTranslations("SourceDocumentDetail");
  const tCommon = useTranslations("Common");
  const tActions = useTranslations("CandidateAction");
  const diagnosticMessages = useDiagnosticMessages();
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const saveOperationIdRef = useRef<string | null>(null);
  const draftRevisionIdRef = useRef<string | null>(null);
  const continueNavigationRef = useRef<(() => void) | null>(null);
  const continueActionRef = useRef<(() => void | Promise<void>) | null>(null);
  const splitIdentityRef = useRef<{
    operationId: string;
    newSourceDocumentId: string;
    payloadKey: string;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadError, setReloadError] = useState(false);
  const busy =
    isSaving ||
    isDeleting ||
    isRetrying ||
    isSplitting ||
    isReloading ||
    isAccepting ||
    isAbandoning ||
    isCancelling;

  const {
    pendingChanges,
    hasPendingChanges,
    pendingChangesCount,
    handleSourceDocChange,
    handleEntryChange,
    discardAllChanges,
    resetChanges,
  } = usePendingChanges({ sourceDocument, ledgerEntries });

  const {
    selectedIds,
    isSelectionMode,
    isAllSelected,
    handleSelect: handleSelectEntry,
    handleSelectAll: handleSelectAllEntries,
    toggleSelectionMode: handleToggleSelectionMode,
    clearSelection,
    retainSelection,
  } = useSelection({ allIds: ledgerEntries.map((e) => e.id) });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [showRetryDialog, setShowRetryDialog] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [showSaveAndContinueConfirm, setShowSaveAndContinueConfirm] = useState(false);

  useEffect(() => {
    if (open && sourceDocument && !hasPendingChanges) {
      resetChanges();
    }
  }, [open, sourceDocument, hasPendingChanges, resetChanges]);

  useEffect(() => {
    if (hasPendingChanges) {
      draftRevisionIdRef.current ??= sourceDocument?.activeRevisionId ?? null;
    } else {
      draftRevisionIdRef.current = null;
      saveOperationIdRef.current = null;
    }
  }, [hasPendingChanges, sourceDocument?.activeRevisionId]);

  useEffect(() => {
    if (sourceDocument?.id == null) return;
    const key = `source-document-detail:${ledgerId}:${sourceDocument.id}`;
    if (!hasPendingChanges) {
      useUnsavedChangesStore.getState().registerLeaveGuard(key, null);
      return;
    }
    useUnsavedChangesStore.getState().registerLeaveGuard(key, {
      requestLeave: (continueNavigation) => {
        continueNavigationRef.current = continueNavigation;
        setShowUnsavedConfirm(true);
      },
    });
    return () => useUnsavedChangesStore.getState().registerLeaveGuard(key, null);
  }, [hasPendingChanges, ledgerId, sourceDocument?.id]);

  const hasRevisionConflict =
    hasPendingChanges &&
    draftRevisionIdRef.current != null &&
    sourceDocument?.activeRevisionId != null &&
    draftRevisionIdRef.current !== sourceDocument.activeRevisionId;

  const handleClose = useCallback(() => {
    if (busy) return;
    if (hasPendingChanges) {
      continueNavigationRef.current = null;
      setShowUnsavedConfirm(true);
    } else {
      onClose();
    }
  }, [busy, hasPendingChanges, onClose]);

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
    sourceDocument?.activeRevisionId,
    hasRevisionConflict,
    pendingChanges,
    onSaveAll,
    pendingChangesCount,
    t,
    discardAllChanges,
  ]);

  const handleSaveAllAndClose = useCallback(async () => {
    const saved = await handleSaveAll();
    if (!saved) return false;

    setShowUnsavedConfirm(false);
    const continueNavigation = continueNavigationRef.current;
    continueNavigationRef.current = null;
    if (continueNavigation != null) continueNavigation();
    else onClose();
    return true;
  }, [handleSaveAll, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    discardAllChanges();
    setShowUnsavedConfirm(false);
    const continueNavigation = continueNavigationRef.current;
    continueNavigationRef.current = null;
    if (continueNavigation != null) continueNavigation();
    else onClose();
  }, [onClose, discardAllChanges]);

  const handleReload = useCallback(async () => {
    if (onReload == null || isReloading) return false;
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
  }, [clearSelection, discardAllChanges, isReloading, onReload]);

  const requestAction = useCallback(
    (action: () => void | Promise<void>) => {
      if (busy) return;
      if (hasRevisionConflict) return;
      if (hasPendingChanges) {
        continueActionRef.current = action;
        setShowSaveAndContinueConfirm(true);
        return;
      }
      void action();
    },
    [busy, hasPendingChanges, hasRevisionConflict]
  );

  const handleSaveAndContinue = useCallback(async () => {
    const saved = await handleSaveAll();
    if (!saved) return false;
    const action = continueActionRef.current;
    continueActionRef.current = null;
    setShowSaveAndContinueConfirm(false);
    await action?.();
    return true;
  }, [handleSaveAll]);

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

  const handleDeleteDocument = async () => {
    if (busy) return;
    setIsDeleting(true);
    try {
      await onDelete?.();
    } finally {
      setIsDeleting(false);
    }
  };

  const displayTitle = pendingChanges.sourceDoc.title ?? sourceDocument?.title ?? "";

  const splitInitialDate =
    sourceDocument?.entryDate ?? sourceDocument?.createdAt.slice(0, 10) ?? "";

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => !val && !busy && handleClose()}>
        <DialogContent
          variant="detail"
          {...(onExitComplete !== undefined ? { onExitComplete } : {})}
          className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
          onOpenAutoFocus={() => {
            restoreFocusRef.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocusRef.current?.focus();
          }}
          aria-describedby={undefined}
          hideCloseButton={busy}
          onEscapeKeyDown={(event) => busy && event.preventDefault()}
          onPointerDownOutside={(event) => busy && event.preventDefault()}
        >
          <DialogHeader className="shrink-0 flex-row items-center gap-3 space-y-0 border-b px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:py-3">
            <DialogTitle className="sr-only">{displayTitle}</DialogTitle>
            {onBack != null && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onBack}
                disabled={busy}
                aria-label={tCommon("back")}
                title={tCommon("back")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1 min-w-0 pr-8">
              <EditableField
                value={displayTitle}
                onChange={(v) => handleSourceDocChange({ title: v })}
                placeholder={t("untitled")}
                displayClassName="font-semibold text-text text-base truncate"
                inputClassName="font-semibold text-base"
                disabled={readOnly || busy}
              />
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {loadError && !sourceDocument ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm font-medium text-text">{t("loadError")}</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose} disabled={isReloading}>
                    {tCommon("close")}
                  </Button>
                  <Button onClick={() => void handleReload()} disabled={isReloading}>
                    <RefreshCw className={cn("size-4", isReloading && "animate-spin")} />
                    {tCommon("retry")}
                  </Button>
                </div>
              </div>
            ) : null}
            {isLoading && !sourceDocument && (
              <div className="space-y-3 animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-border" />
                  <div className="h-3 w-24 bg-border rounded" />
                </div>
                <div className="rounded-xl border border-border p-3 space-y-2">
                  <div className="h-3 w-16 bg-border rounded" />
                  <div className="h-6 w-28 bg-border rounded" />
                </div>
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2.5 rounded-lg border border-border"
                    >
                      <div className="h-8 w-8 rounded-full bg-border" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-28 bg-border rounded" />
                        <div className="h-2.5 w-16 bg-border rounded" />
                      </div>
                      <div className="h-3.5 w-14 bg-border rounded" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sourceDocument && (
              <>
                {hasRevisionConflict ? (
                  <div
                    className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3"
                    role="alert"
                  >
                    <p className="text-sm font-medium text-text">{t("revisionConflict")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("revisionConflictDescription")}
                    </p>
                    {reloadError ? (
                      <p className="mt-2 text-xs text-destructive">{t("reloadFailed")}</p>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => void handleReload()}
                      disabled={isReloading}
                    >
                      <RefreshCw className={cn("size-4", isReloading && "animate-spin")} />
                      {t("reloadServerData")}
                    </Button>
                  </div>
                ) : null}
                {/* Diagnostic code display for anomaly/failed states */}
                {(sourceDocument.status === "anomaly" || sourceDocument.status === "failed") && (
                  <div className="mb-3 px-1">
                    {(() => {
                      const stableCode: AnomalyCode | ProcessingFailureCode =
                        sourceDocument.status === "anomaly"
                          ? toStableAnomalyCode(sourceDocument.anomalyReason)
                          : toStableFailureCode((sourceDocument as SourceDocument).errorCode);
                      return (
                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-danger/5 border border-danger/10">
                          <span
                            className="mt-1 size-2 shrink-0 rounded-full bg-danger"
                            aria-hidden
                          />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-danger">
                              {diagnosticMessages.label(stableCode)}
                            </span>
                            <span className="text-[11px] text-muted-foreground/70">
                              {diagnosticMessages.description(stableCode)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
                {/* Retained active result notice */}
                {(sourceDocument.status === "anomaly" || sourceDocument.status === "failed") &&
                  sourceDocument.activeResultSummary != null && (
                    <div className="mb-3 px-1">
                      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium text-primary">
                            {t("activeResultTitle")}
                          </span>
                          <span className="text-[11px] text-muted-foreground/70">
                            {t("activeResultDescription")}
                          </span>
                          <AmountText variant="group">
                            {sourceDocument.activeResultSummary.entryCount} ·{" "}
                            {sourceDocument.activeResultSummary.total}
                          </AmountText>
                        </div>
                      </div>
                    </div>
                  )}
                <SourceDocumentViewDetails
                  sourceDocument={sourceDocument}
                  ledgerEntries={ledgerEntries}
                  categories={categories}
                  preferredCurrencies={preferredCurrencies}
                  mainCurrency={_mainCurrency}
                  pendingChanges={pendingChanges}
                  selectedEntryIds={selectedIds}
                  isSelectionMode={isSelectionMode}
                  isLoadingImages={isLoadingImages}
                  onSourceDocChange={handleSourceDocChange}
                  onEntryChange={handleEntryChange}
                  onSelectEntry={handleSelectEntry}
                  onSelectAllEntries={handleSelectAllEntries}
                  onToggleSelectionMode={handleToggleSelectionMode}
                  readOnly={readOnly || busy}
                  {...(cachedImageUrls != null ? { cachedImageUrls } : {})}
                />
              </>
            )}
          </div>

          {!readOnly && (
            <LedgerEntriesBatchActionToolbar
              selectedCount={selectedIds.length}
              totalCount={ledgerEntries.length}
              isAllSelected={isAllSelected}
              onSelectAll={() => handleSelectAllEntries(true)}
              onClearSelection={() => handleSelectAllEntries(false)}
              onChangeCategory={handleBatchCategory}
              onChangeCurrency={handleBatchCurrency}
              {...(sourceDocument?.supportedActions.includes("split_entries") && onSplit != null
                ? { onSplit: handleOpenSplit }
                : {})}
              onDelete={() => requestAction(() => setShowBatchDeleteConfirm(true))}
              categories={categories}
              preferredCurrencies={preferredCurrencies}
              isChangingCategory={isSaving}
              isChangingCurrency={isSaving}
              isProcessing={busy}
              variant="inline"
            />
          )}

          <ConfirmDialog
            open={showBatchDeleteConfirm}
            onOpenChange={setShowBatchDeleteConfirm}
            title={t("batchDeleteTitle")}
            description={t("batchDeleteDescription", { count: selectedIds.length })}
            variant="destructive"
            confirmLabel={tCommon("delete")}
            onConfirm={handleBatchDelete}
          />

          {!readOnly && (
            <div className="z-modal-footer flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-surface/80 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:bg-surface2/30 sm:py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {/* Candidate actions: Accept / Abandon */}
                {sourceDocument?.supportedActions.includes("accept_candidate") &&
                  onAcceptCandidate != null && (
                    <>
                      <Button
                        variant="default"
                        size="sm"
                        className="h-9 px-3 gap-1.5"
                        onClick={onAcceptCandidate}
                        disabled={busy}
                      >
                        <CheckCheck className={cn("h-3.5 w-3.5", isAccepting && "animate-spin")} />
                        <span className="hidden sm:inline">{tActions("accept")}</span>
                      </Button>
                      {sourceDocument.supportedActions.includes("abandon_candidate") &&
                        onAbandonCandidate != null && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 px-3 gap-1.5 text-muted-foreground"
                            onClick={onAbandonCandidate}
                            disabled={busy}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{tActions("abandon")}</span>
                          </Button>
                        )}
                    </>
                  )}

                {sourceDocument?.supportedActions.includes("abandon_candidate") &&
                  !sourceDocument.supportedActions.includes("accept_candidate") &&
                  onAbandonCandidate != null && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 px-3 text-muted-foreground"
                      onClick={onAbandonCandidate}
                      disabled={busy}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{tActions("abandon")}</span>
                    </Button>
                  )}

                {sourceDocument?.supportedActions.includes("cancel_processing") &&
                  onCancelProcessing != null && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 px-3 text-muted-foreground"
                      onClick={onCancelProcessing}
                      disabled={busy}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{tActions("cancelProcessing")}</span>
                    </Button>
                  )}

                {/* Edit & Retry */}
                {sourceDocument?.supportedActions.includes("edit_retry") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-3 gap-1.5 text-muted-foreground"
                    onClick={() => setShowRetryDialog(true)}
                    disabled={busy}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t("editRetry")}</span>
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 gap-1.5 text-destructive/70 border-destructive/20 hover:bg-destructive/5 hover:text-destructive"
                  onClick={() => requestAction(() => setShowDeleteConfirm(true))}
                  disabled={busy}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{tCommon("delete")}</span>
                </Button>
              </div>

              <div className="flex items-center gap-2">
                {hasPendingChanges ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9"
                      onClick={discardAllChanges}
                      disabled={busy}
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      {t("discardChanges")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 gap-1.5 shadow-lg shadow-primary/20"
                      onClick={handleSaveAll}
                      disabled={busy || hasRevisionConflict}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {t("saveChanges", { count: pendingChangesCount })}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </DialogContent>

        <ConfirmDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          title={tCommon("delete")}
          description={t("deleteConfirmDesc")}
          onConfirm={handleDeleteDocument}
          variant="destructive"
          confirmLabel={tCommon("delete")}
        />

        <ConfirmDialog
          open={showSaveAndContinueConfirm}
          onOpenChange={(nextOpen) => {
            setShowSaveAndContinueConfirm(nextOpen);
            if (!nextOpen) continueActionRef.current = null;
          }}
          title={t("saveBeforeActionTitle")}
          description={t("saveBeforeActionDescription")}
          onConfirm={handleSaveAndContinue}
          confirmLabel={t("saveAndContinue")}
        />

        <ConfirmDialog
          open={showUnsavedConfirm}
          onOpenChange={(nextOpen) => {
            setShowUnsavedConfirm(nextOpen);
            if (!nextOpen) continueNavigationRef.current = null;
          }}
          title={t("unsavedChanges")}
          description={t("unsavedChangesDesc")}
          onConfirm={() => setShowUnsavedConfirm(false)}
          cancelLabel={tCommon("cancel")}
          onSave={handleSaveAllAndClose}
          saveLabel={tCommon("save")}
          onDiscard={handleDiscardAndClose}
          discardLabel={t("discardChanges")}
        />

        {sourceDocument && !readOnly && (
          <SourceDocumentEditRetryDialog
            ledgerId={ledgerId}
            sourceDocument={sourceDocument}
            open={showRetryDialog}
            onOpenChange={setShowRetryDialog}
            onPendingChange={setIsRetrying}
            onSuccess={() => {
              setShowRetryDialog(false);
              onClose();
            }}
          />
        )}
      </Dialog>
      {showSplitDialog ? (
        <SourceDocumentSplitDialog
          open
          selectedEntries={ledgerEntries.filter((entry) => selectedIds.includes(entry.id))}
          initialDate={splitInitialDate}
          isSubmitting={isSplitting}
          onOpenChange={setShowSplitDialog}
          onSubmit={handleSplit}
        />
      ) : null}
    </>
  );
});
