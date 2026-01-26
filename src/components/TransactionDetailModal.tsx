"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Transaction, Category } from "@/types/api";
import { TransactionEditForm, TransactionEditFormData } from "./transaction/TransactionEditForm";
import { TransactionViewDetails } from "./transaction/TransactionViewDetails";

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  categories: Category[];
  open: boolean;
  onClose: () => void;
  onUpdate: (data: {
    categoryId?: string | null;
    itemName?: string;
    amount?: number;
    currency?: string | null;
    transactionDate?: string | null;
  }) => void;
  onDelete: () => void;
}

export function TransactionDetailModal({
  transaction,
  categories,
  open,
  onClose,
  onUpdate,
  onDelete,
}: TransactionDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<TransactionEditFormData>({
    itemName: "",
    amount: 0,
    currency: "",
    categoryId: "",
    transactionDate: "",
  });

  // Reset edit state when transaction changes
  const handleOpen = () => {
    if (transaction) {
      setEditData({
        itemName: transaction.itemName,
        amount: parseFloat(transaction.amount),
        currency: transaction.currency || "",
        categoryId: transaction.categoryId || "",
        transactionDate: transaction.transactionDate || "",
      });
      setIsEditing(false);
    }
  };

  const handleSave = () => {
    onUpdate({
      itemName: editData.itemName,
      amount: editData.amount,
      currency: editData.currency || null,
      categoryId: editData.categoryId || null,
      transactionDate: editData.transactionDate || null,
    });
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (confirm("确定要删除这条记录吗？")) {
      onDelete();
      onClose();
    }
  };

  const handleClose = () => {
    setIsEditing(false);
    onClose();
  };

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
      <DialogContent onAnimationEnd={handleOpen} className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>交易详情</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {isEditing ? (
            <TransactionEditForm
              data={editData}
              categories={categories}
              onChange={setEditData}
              onSave={handleSave}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <TransactionViewDetails
              transaction={transaction}
              onEdit={() => setIsEditing(true)}
              onDelete={handleDelete}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

