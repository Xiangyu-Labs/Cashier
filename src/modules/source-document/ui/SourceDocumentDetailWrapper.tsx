"use client";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { useCallback } from "react";
import { SourceDocumentDetailModal } from "./SourceDocumentDetailModal";
import { SourceDocumentDuplicateReviewDialog } from "./SourceDocumentDuplicateReviewDialog";
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
  onBack?: () => void;
  onExitComplete?: () => void;
  categories: EntryCategory[];
  mainCurrency: string;
  preferredCurrencies: string[];
  ledgerEntries?: LedgerEntry[];
}

export function SourceDocumentDetailWrapper({
  id,
  ledgerId,
  open,
  onClose,
  onBack,
  onExitComplete,
  categories,
  mainCurrency,
  preferredCurrencies,
  ledgerEntries: initialLedgerEntries,
}: SourceDocumentDetailWrapperProps) {
  const {
    sourceDocument,
    currentLedgerEntries,
    ledgerId: detailLedgerId,
    isLoading,
    isLoadingImages,
    error,
    refetch,
  } = useSourceDocumentDetailData({
    id,
    ledgerId,
    open,
    ...(initialLedgerEntries !== undefined ? { initialLedgerEntries } : {}),
  });

  const {
    saveChanges,
    splitEntries,
    addEntry,
    deleteEntry,
    batchUpdate,
    batchDeleteEntries,
    deleteDocument,
  } = useSourceDocumentDetailMutations({
    id,
    ledgerId,
    onClose,
  });

  const pendingRevisionId = sourceDocument?.pendingRevisionId ?? undefined;

  const {
    acceptCandidate,
    abandonCandidate,
    cancelProcessing,
    isAccepting,
    isAbandoning,
    isCancelling,
  } = useSourceDocumentRecoveryMutations({
    ledgerId: detailLedgerId ?? ledgerId,
    sourceDocumentId: id,
    ...(pendingRevisionId !== undefined ? { revisionId: pendingRevisionId } : {}),
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

  const handleReload = useCallback(async () => {
    const result = await refetch();
    if (result.error != null || result.data == null) {
      throw result.error ?? new Error("Source document is unavailable");
    }
  }, [refetch]);

  if (
    open &&
    sourceDocument?.status === "duplicate_pending" &&
    sourceDocument.duplicateReview != null
  ) {
    return (
      <SourceDocumentDuplicateReviewDialog
        ledgerId={detailLedgerId ?? ledgerId}
        sourceDocumentId={id}
        open={open}
        onOpenChange={onClose}
        mainCurrency={mainCurrency}
      />
    );
  }

  return (
    <SourceDocumentDetailModal
      ledgerId={detailLedgerId}
      sourceDocument={sourceDocument}
      isLoading={isLoading}
      isLoadingImages={isLoadingImages}
      loadError={error != null}
      onReload={handleReload}
      ledgerEntries={currentLedgerEntries}
      categories={categories}
      mainCurrency={mainCurrency}
      preferredCurrencies={preferredCurrencies}
      open={open}
      onClose={onClose}
      {...(onBack !== undefined ? { onBack } : {})}
      {...(onExitComplete !== undefined ? { onExitComplete } : {})}
      onSaveAll={saveChanges}
      onSplit={splitEntries}
      onAddEntry={addEntry}
      onDeleteEntry={deleteEntry}
      onBatchUpdate={batchUpdate}
      onBatchDeleteEntries={batchDeleteEntries}
      onDelete={deleteDocument}
      onAcceptCandidate={handleAcceptCandidate}
      onAbandonCandidate={handleAbandonCandidate}
      onCancelProcessing={cancelProcessing}
      isAccepting={isAccepting}
      isAbandoning={isAbandoning}
      isCancelling={isCancelling}
    />
  );
}
