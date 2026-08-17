"use client";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SourceDocumentDetailModal } from "./SourceDocumentDetailModal";
import { SourceDocumentDuplicateReviewDialog } from "./SourceDocumentDuplicateReviewDialog";
import {
  useSourceDocumentDetailData,
  useSourceDocumentDetailMutations,
  useSourceDocumentRecoveryMutations,
} from "@/modules/source-document/hooks";
import type { EntryCategory } from "@/modules/ledger/contracts";
import type { Ledger } from "@/modules/ledger/contracts";
import { queryKeys } from "@/lib/query-keys";

interface SourceDocumentDetailWrapperProps {
  id: string;
  ledgerId: string;
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  onExitComplete?: () => void;
  categories: EntryCategory[];
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
  ledgerEntries: initialLedgerEntries,
}: SourceDocumentDetailWrapperProps) {
  const queryClient = useQueryClient();
  const ledger = queryClient.getQueryData<Ledger>(queryKeys.ledger(ledgerId));
  const mainCurrency = ledger?.settings.mainCurrency ?? "CNY";
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

  const { saveChanges, splitEntries, batchUpdate, batchDeleteEntries, deleteDocument } =
    useSourceDocumentDetailMutations({
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
      open={open}
      onClose={onClose}
      {...(onBack !== undefined ? { onBack } : {})}
      {...(onExitComplete !== undefined ? { onExitComplete } : {})}
      onSaveAll={saveChanges}
      onSplit={splitEntries}
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
