"use client";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SourceDocumentDetailModal } from "./SourceDocumentDetailModal";
import {
  useSourceDocumentDetailData,
  useSourceDocumentDetailMutations,
  useSourceDocumentRecoveryMutations,
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

  const candidateRevisionId: string | undefined =
    sourceDocument?.status === "candidate_pending" ? (sourceDocument.pendingRevisionId ?? undefined) : undefined;

  const {
    acceptCandidate,
    abandonCandidate,
    createManualCorrection,
    isAccepting,
    isAbandoning,
    isCreatingManualCorrection,
  } = useSourceDocumentRecoveryMutations({
    ledgerId: detailLedgerId ?? ledgerId,
    sourceDocumentId: id,
    ...(candidateRevisionId !== undefined ? { revisionId: candidateRevisionId } : {}),
    onSuccess: onClose,
  });

  const handleAcceptCandidate = useCallback(async () => {
    if (sourceDocument == null) return;
    await acceptCandidate();
  }, [sourceDocument, acceptCandidate]);

  const handleAbandonCandidate = useCallback(async () => {
    if (sourceDocument == null) return;
    await abandonCandidate();
  }, [sourceDocument, abandonCandidate]);

  const handleManualCorrection = useCallback(async () => {
    if (sourceDocument == null) return;
    await createManualCorrection();
  }, [sourceDocument, createManualCorrection]);

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
      onAcceptCandidate={handleAcceptCandidate}
      onAbandonCandidate={handleAbandonCandidate}
      onManualCorrection={handleManualCorrection}
      isAccepting={isAccepting}
      isAbandoning={isAbandoning}
      isCreatingManualCorrection={isCreatingManualCorrection}
    />
  );
}
