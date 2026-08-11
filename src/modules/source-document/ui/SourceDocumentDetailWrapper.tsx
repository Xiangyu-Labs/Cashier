"use client";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
  const tCommon = useTranslations("Common");
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
  } = useSourceDocumentDetailData({
    id,
    ledgerId,
    open,
    ...(initialLedgerEntries !== undefined ? { initialLedgerEntries } : {}),
  });

  const { saveChanges, batchUpdate, batchDeleteEntries, deleteDocument } =
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
      ledgerEntries={currentLedgerEntries}
      categories={categories}
      open={open}
      onClose={onClose}
      {...(onBack !== undefined ? { onBack } : {})}
      {...(onExitComplete !== undefined ? { onExitComplete } : {})}
      onSaveAll={saveChanges}
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
