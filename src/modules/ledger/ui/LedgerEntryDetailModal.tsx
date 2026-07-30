"use client";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { useState, useCallback, memo, useMemo, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LedgerEntryViewDetails, type EntryPendingChanges } from "./LedgerEntryViewDetails";

interface LedgerEntryDetailModalProps {
  ledgerEntry: LedgerEntry | null;
  isLoading?: boolean;
  categories: EntryCategory[];
  preferredCurrencies?: string[];
  mainCurrency?: string;
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  onExitComplete?: () => void;
  onUpdate: (data: {
    categoryId?: string | null;
    itemName?: string;
    amount?: number;
    currency?: string | null;
    description?: string | null;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  onViewSourceDocument?: () => void;
}

export const LedgerEntryDetailModal = memo(function LedgerEntryDetailModal({
  ledgerEntry,
  isLoading = false,
  categories,
  preferredCurrencies,
  mainCurrency = "CNY",
  open,
  onClose,
  onBack,
  onExitComplete,
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

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!ledgerEntry) return false;

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
    try {
      await onUpdate(updateData);
      toast.success(tCommon("saveAllSuccess", { count: changeCount }));
      setPendingChanges({});
      return true;
    } catch {
      toast.error(tCommon("saveFailed"));
      return false;
    }
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

  const handleSaveAndClose = useCallback(async () => {
    const saved = await handleSave();
    if (!saved) return;

    setShowUnsavedConfirm(false);
    onClose();
  }, [handleSave, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setPendingChanges({});
    setShowUnsavedConfirm(false);
    onClose();
  }, [onClose]);

  const handleDelete = useCallback(async () => {
    try {
      await onDelete();
      setShowDeleteConfirm(false);
      onClose();
    } catch {
      // The mutation owns delete failure feedback.
    }
  }, [onDelete, onClose]);

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
        <DialogContent
          variant="detail"
          {...(onExitComplete !== undefined ? { onExitComplete } : {})}
          className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          aria-describedby={undefined}
        >
          <VisuallyHidden.Root>
            <DialogTitle>{t("unsavedChanges")}</DialogTitle>
          </VisuallyHidden.Root>

          {onBack != null && (
            <div className="shrink-0 border-b px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:py-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onBack}
                aria-label={tCommon("back")}
                title={tCommon("back")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
          )}

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
              mainCurrency={mainCurrency}
              pendingChanges={pendingChanges}
              onFieldChange={handleFieldChange}
              onSave={handleSave}
              onDiscard={handleDiscard}
              onDelete={() => setShowDeleteConfirm(true)}
              {...(preferredCurrencies !== undefined ? { preferredCurrencies } : {})}
              {...(onViewSourceDocument != null &&
              ledgerEntry.sourceDocumentId != null &&
              ledgerEntry.sourceDocumentId !== ""
                ? { onViewSourceDocument }
                : {})}
            />
          )}
        </DialogContent>

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
      </Dialog>
    </>
  );
});
