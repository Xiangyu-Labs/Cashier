"use client";

import { useState, useEffect, memo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  type SourceDocument,
  type SourceDocumentLight,
  type LedgerEntry,
  type EntryCategory,
} from "@/types/api";
import { Trash2, FileText, X, Save, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SourceDocumentViewDetails } from "./SourceDocumentViewDetails";
import { usePendingChanges } from "../client/hooks/use-pending-changes";
import { type EntryEditData } from "@/components/entries";
import { useSelection } from "@/hooks/use-selection";
import { EditableField } from "@/components/ui/editable-field";
import { SourceDocumentEditRetryDialog } from "./SourceDocumentEditRetryDialog";
import { BatchActionToolbar } from "@/components/batch-action-toolbar";

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
  onUpdateSourceDoc: (data: { title?: string; entryDate?: string }) => Promise<void>;
  onUpdateImages: (images: { data: string; mimeType: string }[]) => Promise<void>;
  onUpdateEntry: (id: string, data: Partial<EntryEditData>) => Promise<void>;
  onBatchUpdate: (
    ids: string[],
    data: {
      categoryId?: string;
      currency?: string;
      entryDate?: string;
      description?: string;
    }
  ) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
  onBatchDelete?: (ids: string[]) => Promise<void>;
  onDelete?: () => void;
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
  onUpdateSourceDoc,
  onUpdateImages,
  onUpdateEntry,
  onBatchUpdate,
  onDeleteEntry: _onDeleteEntry,
  onBatchDelete,
  onDelete,
}: SourceDocumentDetailModalProps) {
  const t = useTranslations("SourceDocumentDetail");
  const tCommon = useTranslations("Common");

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
  } = useSelection({ allIds: ledgerEntries.map((e) => e.id) });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [showRetryDialog, setShowRetryDialog] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open && sourceDocument) {
      resetChanges();
    }
  }, [open, sourceDocument, resetChanges]);

  // Handle close with unsaved changes check
  const handleClose = useCallback(() => {
    if (hasPendingChanges) {
      setShowUnsavedConfirm(true);
    } else {
      onClose();
    }
  }, [hasPendingChanges, onClose]);

  // Save all pending changes
  const handleSaveAll = useCallback(async () => {
    setIsSaving(true);
    try {
      // Save source doc changes
      if (Object.keys(pendingChanges.sourceDoc).length > 0) {
        await onUpdateSourceDoc(pendingChanges.sourceDoc);
      }

      // Save entry changes
      for (const [entryId, changes] of Object.entries(pendingChanges.entries)) {
        if (Object.keys(changes).length > 0) {
          await onUpdateEntry(entryId, changes);
        }
      }

      // Clear pending changes after successful save
      discardAllChanges();
      toast.success(t("saveAllSuccess", { count: pendingChangesCount }));
    } catch (error) {
      console.error("Failed to save changes:", error);
      toast.error(t("saveAllError"));
    } finally {
      setIsSaving(false);
    }
  }, [pendingChanges, onUpdateSourceDoc, onUpdateEntry, pendingChangesCount, t, discardAllChanges]);

  // Save all changes and close (for unsaved changes dialog)
  const handleSaveAllAndClose = useCallback(async () => {
    await handleSaveAll();
    setShowUnsavedConfirm(false);
    onClose();
  }, [handleSaveAll, onClose]);

  // Discard all changes and close (for unsaved changes dialog) - only discards changes, does NOT delete the document
  const handleDiscardAndClose = useCallback(() => {
    discardAllChanges();
    setShowUnsavedConfirm(false);
    onClose();
  }, [onClose, discardAllChanges]);

  // Batch operations
  const handleBatchCategory = async (categoryId: string) => {
    if (selectedIds.length === 0) return;
    setIsSaving(true);
    try {
      await onBatchUpdate(selectedIds, { categoryId });
      toast.success(t("batchUpdateSuccess", { count: selectedIds.length }));
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
      await onBatchUpdate(selectedIds, { currency });
      toast.success(t("batchUpdateSuccess", { count: selectedIds.length }));
      clearSelection();
    } catch {
      toast.error(t("batchUpdateError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0 || !onBatchDelete) return;

    setIsSaving(true);
    try {
      await onBatchDelete(selectedIds);
      toast.success(t("batchDeleteSuccess", { count: selectedIds.length }));
      clearSelection();
    } catch {
      toast.error(t("batchDeleteError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDocument = () => {
    onDelete?.();
    setShowDeleteConfirm(false);
  };

  // Display title with pending changes
  const displayTitle = pendingChanges.sourceDoc.title ?? sourceDocument?.title ?? "";

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border"
        onOpenAutoFocus={(e) => e.preventDefault()}
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
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {/* Loading Skeleton State */}
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

          {/* Actual Content */}
          {sourceDocument && (
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
              onUpdateImages={onUpdateImages}
              onEntryChange={handleEntryChange}
              onSelectEntry={handleSelectEntry}
              onSelectAllEntries={handleSelectAllEntries}
              onToggleSelectionMode={handleToggleSelectionMode}
            />
          )}
        </div>

        {/* Batch Actions Toolbar - appears when entries are selected */}
        <BatchActionToolbar
          selectedCount={selectedIds.length}
          totalCount={ledgerEntries.length}
          isAllSelected={isAllSelected}
          onSelectAll={() => handleSelectAllEntries(true)}
          onClearSelection={() => handleSelectAllEntries(false)}
          onChangeCategory={(categoryId) => handleBatchCategory(categoryId ?? "")}
          onChangeCurrency={handleBatchCurrency}
          onDelete={onBatchDelete ? handleBatchDelete : undefined}
          categories={categories}
          preferredCurrencies={preferredCurrencies}
          isChangingCategory={isSaving}
          isChangingCurrency={isSaving}
          isDeleting={isSaving}
          variant="inline"
        />

        {/* Bottom Actions */}
        <div className="shrink-0 px-4 py-3 border-t bg-surface/80 backdrop-blur-md sm:bg-surface2/30 flex justify-between items-center gap-2 z-modal-footer">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 gap-1.5 text-destructive/70 border-destructive/20 hover:bg-destructive/5 hover:text-destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tCommon("delete")}</span>
            </Button>
            {sourceDocument?.type !== "manual" && (
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

      {/* Edit Retry Dialog */}
      {sourceDocument && (
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
