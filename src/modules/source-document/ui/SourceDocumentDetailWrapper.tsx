"use client";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SourceDocumentDetailModal } from "./SourceDocumentDetailModal";
import { useSourceDocumentDetailData, useSourceDocumentDetailMutations, } from "@/modules/source-document/hooks";
import type { EntryCategory } from "@/modules/ledger/contracts";

interface SourceDocumentDetailWrapperProps {
  id: string;
  ledgerId: string;
  open: boolean;
  onClose: () => void;
  categories: EntryCategory[];
  ledgerEntries?: LedgerEntry[];
}

export function SourceDocumentDetailWrapper({
  id,
  ledgerId,
  open,
  onClose,
  categories,
  ledgerEntries: initialLedgerEntries,
}: SourceDocumentDetailWrapperProps) {
  const tCommon = useTranslations("Common");
  const {
    sourceDocument,
    safeSourceDocument,
    currentLedgerEntries,
    safeLedgerId,
    isLoading,
    isLoadingImages,
    error,
  } = useSourceDocumentDetailData({
    id,
    ledgerId,
    open,
    ...(initialLedgerEntries !== undefined ? { initialLedgerEntries } : {}),
  });

  const {
    updateSourceDoc,
    updateImages,
    updateEntry,
    batchUpdate,
    deleteEntry,
    batchDelete,
    deleteDocument,
  } = useSourceDocumentDetailMutations({
    id,
    ledgerId,
    onClose,
  });

  useEffect(() => {
    if (error != null) {
      toast.error(tCommon("error"));
      onClose();
    }
  }, [error, onClose, tCommon]);

  useEffect(() => {
    if (!isLoading && sourceDocument == null && open) {
      onClose();
    }
  }, [isLoading, sourceDocument, open, onClose]);

  return (
    <SourceDocumentDetailModal
      ledgerId={safeLedgerId}
      sourceDocument={safeSourceDocument}
      isLoading={isLoading}
      isLoadingImages={isLoadingImages}
      ledgerEntries={currentLedgerEntries}
      categories={categories}
      open={open}
      onClose={onClose}
      onUpdateSourceDoc={updateSourceDoc}
      onUpdateImages={updateImages}
      onUpdateEntry={updateEntry}
      onBatchUpdate={batchUpdate}
      onDeleteEntry={deleteEntry}
      onBatchDelete={batchDelete}
      onDelete={deleteDocument}
    />
  );
}
