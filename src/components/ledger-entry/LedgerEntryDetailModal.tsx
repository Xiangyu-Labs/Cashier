"use client";

import { useState, useCallback, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { LedgerEntry, EntryCategory } from "@/types/api";
import { LedgerEntryEditForm, LedgerEntryEditFormData } from "./ledger-entry/LedgerEntryEditForm";
import { LedgerEntryViewDetails } from "./ledger-entry/LedgerEntryViewDetails";
import { useTranslations } from "next-intl";

interface LedgerEntryDetailModalProps {
  ledgerEntry: LedgerEntry | null;
  categories: EntryCategory[];
  open: boolean;
  onClose: () => void;
  onUpdate: (data: {
    categoryId?: string | null;
    itemName?: string;
    amount?: number;
    currency?: string | null;
    entryDate?: string | null;
  }) => void;
  onDelete: () => void;
}

export function LedgerEntryDetailModal({
  ledgerEntry,
  categories,
  open,
  onClose,
  onUpdate,
  onDelete,
}: LedgerEntryDetailModalProps): ReactNode | null {
  const t = useTranslations("LedgerEntryDetail");
  const tTab = useTranslations("LedgerEntriesTab");
  const tCommon = useTranslations("Common");

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<LedgerEntryEditFormData>({
    itemName: "",
    amount: 0,
    currency: "",
    categoryId: "",
    entryDate: "",
  });

  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset edit state when ledgerEntry changes
  const handleOpen = useCallback(() => {
    if (ledgerEntry) {
      setEditData({
        itemName: ledgerEntry.itemName,
        amount: parseFloat(ledgerEntry.amount),
        currency: ledgerEntry.currency || "",
        categoryId: ledgerEntry.categoryId || "",
        entryDate: ledgerEntry.entryDate || "",
      });
      setIsEditing(false);
    }
  }, [ledgerEntry]);

  const handleSave = useCallback(() => {
    onUpdate({
      itemName: editData.itemName,
      amount: editData.amount,
      currency: editData.currency || null,
      categoryId: editData.categoryId || null,
      entryDate: editData.entryDate || null,
    });
    setIsEditing(false);
  }, [editData, onUpdate]);

  const handleDelete = useCallback(() => {
    onDelete();
    setShowDeleteConfirm(false);
    onClose();
    toast({
      variant: "success",
      title: tTab("deleteSuccess"),
      description: tTab("deleteSuccess"),
    });
  }, [onDelete, onClose, toast, tTab]);

  const handleClose = useCallback(() => {
    setIsEditing(false);
    onClose();
  }, [onClose]);

  if (!ledgerEntry) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
        <DialogContent onAnimationEnd={handleOpen} className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
          </DialogHeader>

          <div className="py-4">
            {isEditing ? (
              <LedgerEntryEditForm
                data={editData}
                categories={categories}
                onChange={setEditData}
                onSave={handleSave}
                onCancel={() => setIsEditing(false)}
              />
            ) : (
              <LedgerEntryViewDetails
                ledgerEntry={ledgerEntry}
                onEdit={() => setIsEditing(true)}
                onDelete={() => setShowDeleteConfirm(true)}
              />
            )}
          </div>
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
    </>
  );
}
