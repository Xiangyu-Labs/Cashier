"use client";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SourceDocumentDetailModal } from "./SourceDocumentDetailModal";
import {
  useSourceDocumentDetailData,
  useSourceDocumentDetailMutations,
} from "@/modules/source-document/hooks";
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
    currentLedgerEntries,
    ledgerId: detailLedgerId,
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
    updateEntry,
    batchUpdate,
    deleteEntry,
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
      ledgerId={detailLedgerId}
      sourceDocument={sourceDocument}
      isLoading={isLoading}
      isLoadingImages={isLoadingImages}
      ledgerEntries={currentLedgerEntries}
      categories={categories}
      open={open}
      onClose={onClose}
      onUpdateSourceDoc={updateSourceDoc}
      onUpdateEntry={updateEntry}
      onBatchUpdate={batchUpdate}
      onDeleteEntry={deleteEntry}
      onDelete={deleteDocument}
    />
  );
}
