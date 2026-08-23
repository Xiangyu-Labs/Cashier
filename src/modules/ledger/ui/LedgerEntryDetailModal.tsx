"use client";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { useState, useCallback, memo, type ReactNode, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { useTranslations } from "next-intl";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LedgerEntryViewDetails, type EntryPendingChanges } from "./LedgerEntryViewDetails";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";
import { cn } from "@/lib/utils";

interface LedgerEntryDetailModalProps {
  ledgerEntry: LedgerEntry | null;
  isLoading?: boolean;
  loadError?: boolean;
  onReload?: () => Promise<void>;
  categories: EntryCategory[];
  preferredCurrencies: string[];
  mainCurrency: string;
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

function LedgerEntryDetailEditor({
  ledgerEntry,
  isLoading = false,
  loadError = false,
  onReload,
  categories,
  preferredCurrencies,
  mainCurrency,
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

  const [pendingChanges, setPendingChanges] = useState<EntryPendingChanges>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const busy = isSaving || isDeleting || isReloading;
  const continueNavigationRef = useRef<(() => void) | null>(null);

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;
  const detailId = ledgerEntry?.id;
  const detailLedgerId = ledgerEntry?.ledgerId;

  useEffect(() => {
    if (!open) setIsEditMode(false);
  }, [open]);

  useEffect(() => {
    if (detailId == null || detailLedgerId == null) return;
    const key = `ledger-entry-detail:${detailLedgerId}:${detailId}`;
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
  }, [detailId, detailLedgerId, hasPendingChanges]);

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
    if (!ledgerEntry || busy) return false;
    if (Object.keys(pendingChanges).length === 0) return true;

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
    setIsSaving(true);
    try {
      await onUpdate(updateData);
      toast.success(tCommon("saveAllSuccess", { count: changeCount }));
      setPendingChanges({});
      return true;
    } catch {
      toast.error(tCommon("saveFailed"));
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [busy, ledgerEntry, pendingChanges, onUpdate, tCommon]);

  const handleEnterEditMode = useCallback(() => {
    if (busy) return;
    setIsEditMode(true);
  }, [busy]);

  const handleCancelEditMode = useCallback(() => {
    if (busy) return;
    setPendingChanges({});
    setIsEditMode(false);
  }, [busy]);

  const handleEditSave = useCallback(async (): Promise<boolean> => {
    const saved = await handleSave();
    if (saved) setIsEditMode(false);
    return saved;
  }, [handleSave]);

  const handleClose = useCallback(() => {
    if (busy) return;
    if (hasPendingChanges) {
      continueNavigationRef.current = null;
      setShowUnsavedConfirm(true);
    } else {
      onClose();
    }
  }, [busy, hasPendingChanges, onClose]);

  const handleSaveAndClose = useCallback(async () => {
    const saved = await handleSave();
    if (!saved) return false;

    setShowUnsavedConfirm(false);
    const continueNavigation = continueNavigationRef.current;
    continueNavigationRef.current = null;
    if (continueNavigation != null) continueNavigation();
    else onClose();
    return true;
  }, [handleSave, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setPendingChanges({});
    setShowUnsavedConfirm(false);
    const continueNavigation = continueNavigationRef.current;
    continueNavigationRef.current = null;
    if (continueNavigation != null) continueNavigation();
    else onClose();
  }, [onClose]);

  const handleDelete = useCallback(async () => {
    if (busy) return;
    setIsDeleting(true);
    try {
      await onDelete();
      setShowDeleteConfirm(false);
      onClose();
    } catch {
      // The mutation owns delete failure feedback.
    } finally {
      setIsDeleting(false);
    }
  }, [busy, onDelete, onClose]);

  const handleReload = useCallback(async () => {
    if (onReload == null || isReloading) return;
    setIsReloading(true);
    try {
      await onReload();
    } catch {
      // The query state keeps the load error visible for another retry.
    } finally {
      setIsReloading(false);
    }
  }, [isReloading, onReload]);

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => !val && !busy && handleClose()}>
        <DialogContent
          variant="detail"
          {...(onExitComplete !== undefined ? { onExitComplete } : {})}
          className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          aria-describedby={undefined}
          hideCloseButton={busy}
          onEscapeKeyDown={(event) => busy && event.preventDefault()}
          onPointerDownOutside={(event) => busy && event.preventDefault()}
        >
          <VisuallyHidden.Root>
            <DialogTitle>{t("title")}</DialogTitle>
          </VisuallyHidden.Root>

          {onBack != null && (
            <div className="shrink-0 border-b px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:py-2">
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
            </div>
          )}

          {loadError && !ledgerEntry ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
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

          {isLoading && !ledgerEntry && !loadError && (
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
              onSave={handleEditSave}
              isEditMode={isEditMode}
              onEdit={handleEnterEditMode}
              onCancelEdit={handleCancelEditMode}
              onDelete={() => setShowDeleteConfirm(true)}
              busy={busy}
              preferredCurrencies={preferredCurrencies}
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
          onOpenChange={(nextOpen) => {
            setShowUnsavedConfirm(nextOpen);
            if (!nextOpen) continueNavigationRef.current = null;
          }}
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
}

export const LedgerEntryDetailModal = memo(function LedgerEntryDetailModal(
  props: LedgerEntryDetailModalProps
) {
  const editorKey = props.ledgerEntry?.id ?? "empty";
  return <LedgerEntryDetailEditor key={editorKey} {...props} />;
});
