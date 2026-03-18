"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SourceDocumentDetailModal } from "./SourceDocumentDetailModal";
import { useSourceDocumentDetailData } from "./hooks/use-source-document-detail-data";
import { useSourceDocumentDetailMutations } from "./hooks/use-source-document-detail-mutations";
import type { EntryCategory, LedgerEntry } from "@/types/api";

interface SourceDocumentDetailWrapperProps {
  id: string;
  open: boolean;
  onClose: () => void;
  categories: EntryCategory[];
  ledgerEntries?: LedgerEntry[];
}

export function SourceDocumentDetailWrapper({
  id,
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
    ledgerId,
    safeLedgerId,
    isLoading,
    isLoadingImages,
    error,
  } = useSourceDocumentDetailData({
    id,
    open,
    initialLedgerEntries,
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
