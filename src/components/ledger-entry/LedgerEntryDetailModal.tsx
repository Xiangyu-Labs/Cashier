"use client";

import { useState, useCallback, type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { LedgerEntry, EntryCategory } from "@/types/api";
import { LedgerEntryViewDetails, LedgerEntryEditFormData } from "./LedgerEntryViewDetails";
import { useTranslations } from "next-intl";

interface LedgerEntryDetailModalProps {
  ledgerEntry: LedgerEntry | null;
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
    entryDate?: string | null;
    description?: string | null;
  }) => void;
  onDelete: () => void;
}

export function LedgerEntryDetailModal({
  ledgerEntry,
  categories,
  preferredCurrencies,
  mainCurrency = "CNY",
  open,
  onClose,
  onUpdate,
  onDelete,
}: LedgerEntryDetailModalProps): ReactNode | null {
  const tTab = useTranslations("LedgerEntriesTab");
  const tCommon = useTranslations("Common");

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<LedgerEntryEditFormData>({
    itemName: "",
    amount: 0,
    currency: "",
    categoryId: "",
    entryDate: "",
    description: "",
  });


  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Initialize edit data when ledgerEntry changes or modal opens
  const [prevLedgerEntry, setPrevLedgerEntry] = useState(ledgerEntry);
  if (ledgerEntry !== prevLedgerEntry) {
    setPrevLedgerEntry(ledgerEntry);
    if (ledgerEntry && open) {
      setEditData({
        itemName: ledgerEntry.itemName,
        amount: parseFloat(ledgerEntry.amount),
        currency: ledgerEntry.currency || "",
        categoryId: ledgerEntry.categoryId || "",
        entryDate: ledgerEntry.entryDate ? ledgerEntry.entryDate.split("T")[0] : "",
        description: ledgerEntry.description || "",
      });
      setIsEditing(false); // Default to view mode
    }
  }

  const handleSave = useCallback(() => {
    onUpdate({
      itemName: editData.itemName,
      amount: editData.amount,
      currency: (editData.currency === "" || editData.currency === "unknown") ? "unknown" : editData.currency,
      categoryId: editData.categoryId || null,
      entryDate: editData.entryDate || null,
      description: editData.description || null,
    });
    setIsEditing(false);
  }, [editData, onUpdate]);

  const handleDelete = useCallback(() => {
    onDelete();
    setShowDeleteConfirm(false);
    onClose();
    toast.success(tTab("deleteSuccess"));
  }, [onDelete, onClose, tTab]);

  const handleClose = useCallback(() => {
    setIsEditing(false);
    onClose();
  }, [onClose]);

  if (!ledgerEntry) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto w-full max-w-lg pr-4">


          <LedgerEntryViewDetails
            ledgerEntry={ledgerEntry}
            isEditing={isEditing}
            editData={editData}
            categories={categories}
            preferredCurrencies={preferredCurrencies}
            mainCurrency={mainCurrency}
            onEditStart={() => setIsEditing(true)}
            onEditChange={setEditData}
            onEditSave={handleSave}
            onEditCancel={() => {
              setIsEditing(false);
              if (ledgerEntry) {
                setEditData({
                  itemName: ledgerEntry.itemName,
                  amount: parseFloat(ledgerEntry.amount),
                  currency: ledgerEntry.currency || "",
                  categoryId: ledgerEntry.categoryId || "",
                  entryDate: ledgerEntry.entryDate ? ledgerEntry.entryDate.split("T")[0] : "",
                  description: ledgerEntry.description || "",
                });
              }
            }}
            onDelete={() => setShowDeleteConfirm(true)}
          />
        </DialogContent>
      </Dialog >

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={tTab("deleteConfirmTitle")}
        description={tTab("deleteConfirmDesc")}
        onConfirm={handleDelete}
        variant="destructive"
        confirmLabel={tCommon("delete")}
      />
    </>
  );
}
