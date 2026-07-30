"use client";
import type { LedgerEntry, EntryCategory } from "@/modules/ledger/contracts";
import type { SourceDocumentLight } from "@/modules/source-document/contracts";
import { useState, useEffect, memo, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { SourceDocument } from "@/modules/source-document/contracts";
import {
  AlertCircle,
  CheckCheck,
  RefreshCw,
  Trash2,
  FileText,
  X,
  Save,
  XCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
import { LedgerEntriesBatchActionToolbar } from "@/modules/ledger/ui";
import type { EntryEditData } from "@/modules/source-document/types";

interface SourceDocumentDetailModalProps {
  ledgerId: string;
  sourceDocument: SourceDocument | SourceDocumentLight | null;
  isLoading?: boolean;
  isLoadingImages?: boolean;
  ledgerEntries: LedgerEntry[];
  categories: EntryCategory[];
  preferredCurrencies?: string[];
  mainCurrency?: string;
  open: boolean;
  onClose: () => void;
  onExitComplete?: () => void;
  onUpdateSourceDoc: (data: { title?: string; entryDate?: string }) => Promise<void>;
  onUpdateEntry: (id: string, data: Partial<EntryEditData>) => Promise<void>;
  onBatchUpdate: (
    ids: string[],
    data: {
      categoryId?: string | null;
      currency?: string;
      entryDate?: string;
      description?: string;
    }
  ) => Promise<{ affectedCount: number } | undefined>;
  onDeleteEntry: (id: string) => Promise<void>;
  onDelete?: () => void | Promise<void>;
  // Recovery action callbacks
  onAcceptCandidate?: () => Promise<void>;
  onAbandonCandidate?: () => Promise<void>;
  onCancelProcessing?: () => Promise<void>;
  isAccepting?: boolean;
  isAbandoning?: boolean;
  isCancelling?: boolean;
  readOnly?: boolean;
  offlineImageUrls?: ReadonlyMap<string, string>;
}

export const SourceDocumentDetailModal = memo(function SourceDocumentDetailModal({
  ledgerId,
  sourceDocument,
  isLoading = false,
  isLoadingImages = false,
  ledgerEntries,
  categories,
  preferredCurrencies = [],
  mainCurrency: _mainCurrency = "CNY",
  open,
  onClose,
  onExitComplete,
  onUpdateSourceDoc,
  onUpdateEntry,
  onBatchUpdate,
  onDeleteEntry,
  onDelete,
  onAcceptCandidate,
  onAbandonCandidate,
  onCancelProcessing,
  isAccepting = false,
  isAbandoning = false,
  isCancelling = false,
  readOnly = false,
  offlineImageUrls,
}: SourceDocumentDetailModalProps) {
  const t = useTranslations("SourceDocumentDetail");
  const tCommon = useTranslations("Common");
  const tActions = useTranslations("CandidateAction");
  const tDiag = useTranslations("DiagnosticCode");
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const [isSaving, setIsSaving] = useState(false);

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

  useEffect(() => {
    if (open && sourceDocument) {
      resetChanges();
    }
  }, [open, sourceDocument, resetChanges]);

  const handleClose = useCallback(() => {
    if (hasPendingChanges) {
      setShowUnsavedConfirm(true);
    } else {
      onClose();
    }
  }, [hasPendingChanges, onClose]);

  const handleSaveAll = useCallback(async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      if (Object.keys(pendingChanges.sourceDoc).length > 0) {
        await onUpdateSourceDoc(pendingChanges.sourceDoc);
      }

      for (const [entryId, changes] of Object.entries(pendingChanges.entries)) {
        if (Object.keys(changes).length > 0) {
          await onUpdateEntry(entryId, changes);
        }
      }

      discardAllChanges();
      toast.success(t("saveAllSuccess", { count: pendingChangesCount }));
      return true;
    } catch (error) {
      console.error("Failed to save changes:", error);
      toast.error(t("saveAllError"));
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [pendingChanges, onUpdateSourceDoc, onUpdateEntry, pendingChangesCount, t, discardAllChanges]);

  const handleSaveAllAndClose = useCallback(async () => {
    const saved = await handleSaveAll();
    if (!saved) return;

    setShowUnsavedConfirm(false);
    onClose();
  }, [handleSaveAll, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    discardAllChanges();
    setShowUnsavedConfirm(false);
    onClose();
  }, [onClose, discardAllChanges]);

  const handleBatchCategory = async (categoryId: string | null) => {
    if (selectedIds.length === 0) return;
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

  const handleBatchCurrency = async (currency: string) => {
    if (selectedIds.length === 0) return;
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

  const handleBatchDelete = async () => {
    const failed: string[] = [];
    setIsSaving(true);
    try {
      for (const id of selectedIds) {
        try {
          await onDeleteEntry(id);
        } catch {
          failed.push(id);
        }
      }
      if (failed.length === 0) clearSelection();
      else retainSelection(failed);
      toast.success(t("batchDeleteSuccess", { count: selectedIds.length - failed.length }));
      if (failed.length > 0) toast.error(t("batchDeletePartial", { count: failed.length }));
      setShowBatchDeleteConfirm(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDocument = async () => {
    await onDelete?.();
  };

  const displayTitle = pendingChanges.sourceDoc.title ?? sourceDocument?.title ?? "";

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
      <DialogContent
        {...(onExitComplete !== undefined ? { onExitComplete } : {})}
        className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border p-0 sm:h-auto sm:max-h-[90vh] sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:rounded-lg"
        onOpenAutoFocus={() => {
          restoreFocusRef.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocusRef.current?.focus();
        }}
        aria-describedby={undefined}
      >
        <DialogHeader className="px-5 py-3 border-b shrink-0 flex-row items-center gap-3 space-y-0">
          <DialogTitle className="sr-only">{displayTitle}</DialogTitle>
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 pr-8">
            <EditableField
              value={displayTitle}
              onChange={(v) => handleSourceDocChange({ title: v })}
              placeholder={t("untitled")}
              displayClassName="font-semibold text-text text-base truncate"
              inputClassName="font-semibold text-base"
              disabled={readOnly}
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
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
                        <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium text-danger">
                            {tDiag(stableCode as string)}
                          </span>
                          <span className="text-[11px] text-muted-foreground/70">
                            {tDiag(`${stableCode}_desc`)}
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
                readOnly={readOnly}
                {...(offlineImageUrls != null ? { offlineImageUrls } : {})}
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
            onDelete={() => setShowBatchDeleteConfirm(true)}
            categories={categories}
            preferredCurrencies={preferredCurrencies}
            isChangingCategory={isSaving}
            isChangingCurrency={isSaving}
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
          <div className="z-modal-footer flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-surface/80 px-4 py-3 backdrop-blur-md sm:bg-surface2/30">
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
                      disabled={isAccepting}
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
                          disabled={isAbandoning}
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
                    disabled={isAbandoning}
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
                    disabled={isCancelling}
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
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("editRetry")}</span>
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 gap-1.5 text-destructive/70 border-destructive/20 hover:bg-destructive/5 hover:text-destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tCommon("delete")}</span>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <AnimatePresence>
                {hasPendingChanges && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-2"
                  >
                    <Button variant="ghost" size="sm" className="h-9" onClick={discardAllChanges}>
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      {t("discardChanges")}
                    </Button>
                    <Button
                      size="sm"
                      className="h-9 gap-1.5 shadow-lg shadow-primary/20"
                      onClick={handleSaveAll}
                      disabled={isSaving}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {t("saveChanges", { count: pendingChangesCount })}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
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
        open={showUnsavedConfirm}
        onOpenChange={setShowUnsavedConfirm}
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
          onSuccess={() => {
            setShowRetryDialog(false);
            onClose();
          }}
        />
      )}
    </Dialog>
  );
});
