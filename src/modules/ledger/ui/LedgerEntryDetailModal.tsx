"use client";

import { useState, useCallback, type ReactNode, memo, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { type LedgerEntry, type EntryCategory } from "@/types/api";
import {
  LedgerEntryViewDetails,
  type EntryPendingChanges,
} from "@/modules/ledger/ui/LedgerEntryViewDetails";
import { useTranslations } from "next-intl";

interface LedgerEntryDetailModalProps {
  ledgerEntry: LedgerEntry | null;
  isLoading?: boolean;
  categories: EntryCategory[];
  preferredCurrencies?: string[];
  mainCurrency?: string;
  open: boolean;
  onClose: () => void;
  onUpdate: (data: {
    categoryId?: string | null;
    itemName?: string;
    amount?: number;
    currency?: string | null;
    description?: string | null;
  }) => void;
  onDelete: () => void;
  onViewSourceDocument?: (sourceDocumentId: string) => void;
}

export const LedgerEntryDetailModal = memo(function LedgerEntryDetailModal({
  ledgerEntry,
  isLoading = false,
  categories,
  preferredCurrencies,
  mainCurrency = "CNY",
  open,
  onClose,
  onUpdate,
  onDelete,
  onViewSourceDocument,
}: LedgerEntryDetailModalProps): ReactNode | null {
  const tTab = useTranslations("LedgerEntriesTab");
  const tCommon = useTranslations("Common");
  const t = useTranslations("LedgerEntryDetail");

  const resetKey = `${open}-${ledgerEntry?.id}`;
  const [internalResetKey, setInternalResetKey] = useState(resetKey);
  const [pendingChanges, setPendingChanges] = useState<EntryPendingChanges>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  if (resetKey !== internalResetKey) {
    setInternalResetKey(resetKey);
    if (Object.keys(pendingChanges).length > 0) {
      setTimeout(() => setPendingChanges({}), 0);
    }
  }

  const hasPendingChanges = useMemo(() => {
    return Object.keys(pendingChanges).length > 0;
  }, [pendingChanges]);

  const getOriginalValue = useCallback(
    (field: keyof EntryPendingChanges) => {
      if (!ledgerEntry) return undefined;
      switch (field) {
        case "itemName":
          return ledgerEntry.itemName;
        case "amount":
          return parseFloat(ledgerEntry.amount);
        case "currency":
          return ledgerEntry.currency;
        case "categoryId":
          return ledgerEntry.categoryId;
        case "description":
          return ledgerEntry.description;
        default:
          return undefined;
      }
    },
    [ledgerEntry]
  );

  const handleFieldChange = useCallback(
    (changes: EntryPendingChanges) => {
      setPendingChanges((prev) => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(changes)) {
          const field = key as keyof EntryPendingChanges;
          const originalValue = getOriginalValue(field);

          if (
            value === originalValue ||
            (value === null && originalValue === null) ||
            (typeof value === "number" &&
              typeof originalValue === "number" &&
              value === originalValue)
          ) {
            delete next[field];
          } else {
            (next as Record<string, unknown>)[field] = value;
          }
        }
        return next;
      });
    },
    [getOriginalValue]
  );

  const handleSave = useCallback(() => {
    if (!ledgerEntry) return;

    const updateData: Parameters<typeof onUpdate>[0] = {};

    if (pendingChanges.itemName !== undefined) {
      updateData.itemName = pendingChanges.itemName;
    }
    if (pendingChanges.amount !== undefined) {
      updateData.amount = pendingChanges.amount;
    }
    if (pendingChanges.currency !== undefined) {
      updateData.currency =
        pendingChanges.currency === "unknown" ? "unknown" : pendingChanges.currency;
    }
    if (pendingChanges.categoryId !== undefined) {
      updateData.categoryId = pendingChanges.categoryId;
    }
    if (pendingChanges.description !== undefined) {
      updateData.description = pendingChanges.description;
    }

    const changeCount = Object.keys(updateData).length;
    onUpdate(updateData);
    toast.success(tCommon("saveAllSuccess", { count: changeCount }));
    setPendingChanges({});
  }, [ledgerEntry, pendingChanges, onUpdate, tCommon]);

  const handleDiscard = useCallback(() => {
    setPendingChanges({});
  }, []);

  const handleClose = useCallback(() => {
    if (hasPendingChanges) {
      setShowUnsavedConfirm(true);
    } else {
      onClose();
    }
  }, [hasPendingChanges, onClose]);

  const handleSaveAndClose = useCallback(() => {
    handleSave();
    setShowUnsavedConfirm(false);
    onClose();
  }, [handleSave, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setPendingChanges({});
    setShowUnsavedConfirm(false);
    onClose();
  }, [onClose]);

  const handleDelete = useCallback(() => {
    onDelete();
    setShowDeleteConfirm(false);
    onClose();
    toast.success(tTab("deleteSuccess"));
  }, [onDelete, onClose, tTab]);

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
        <DialogContent
          className="max-h-[90vh] flex flex-col p-0 overflow-hidden w-full max-w-lg"
          aria-describedby={undefined}
        >
          <VisuallyHidden.Root>
            <DialogTitle>{t("unsavedChanges")}</DialogTitle>
          </VisuallyHidden.Root>

          {isLoading && !ledgerEntry && (
            <div className="p-6 space-y-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-border" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-border rounded" />
                  <div className="h-3 w-24 bg-border rounded" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="h-4 w-full bg-border rounded" />
                <div className="h-4 w-3/4 bg-border rounded" />
                <div className="h-4 w-1/2 bg-border rounded" />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <div className="h-9 w-20 bg-border rounded" />
                <div className="h-9 w-20 bg-border rounded" />
              </div>
            </div>
          )}

          {ledgerEntry && (
            <LedgerEntryViewDetails
              ledgerEntry={ledgerEntry}
              categories={categories}
              preferredCurrencies={preferredCurrencies}
              mainCurrency={mainCurrency}
              pendingChanges={pendingChanges}
              onFieldChange={handleFieldChange}
              onSave={handleSave}
              onDiscard={handleDiscard}
              onDelete={() => setShowDeleteConfirm(true)}
              onViewSourceDocument={
                onViewSourceDocument != null &&
                ledgerEntry.sourceDocumentId != null &&
                ledgerEntry.sourceDocumentId !== ""
                  ? () => onViewSourceDocument(ledgerEntry.sourceDocumentId!)
                  : undefined
              }
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={tTab("deleteConfirmTitle")}
        description={tTab("deleteConfirmDesc")}
        onConfirm={handleDelete}
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
        onSave={handleSaveAndClose}
        saveLabel={tCommon("save")}
        onDiscard={handleDiscardAndClose}
        discardLabel={t("discardChanges")}
      />
    </>
  );
});
