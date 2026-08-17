"use client";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  queryKeys,
} from "@/lib/query-keys";
import { getLedgerEntryAction } from "@/modules/ledger/server-actions/get-entry";
import {
  updateLedgerEntryAction,
  deleteLedgerEntryAction,
} from "@/modules/ledger/server-actions/entries";
import { openLedgerDetail } from "@/modules/workspace/ledger-detail-navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { LedgerEntryDetailModal } from "./LedgerEntryDetailModal";

interface LedgerEntryDetailWrapperProps {
  id: string;
  ledgerId: string;
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  onExitComplete?: () => void;
  categories: EntryCategory[];
}

export function LedgerEntryDetailWrapper({
  id,
  ledgerId,
  open,
  onClose,
  onBack,
  onExitComplete,
  categories,
}: LedgerEntryDetailWrapperProps) {
  const tCommon = useTranslations("Common");

  const {
    data: ledgerEntry,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.ledgerEntry(ledgerId, id),
    queryFn: () => getLedgerEntryAction(ledgerId, id),
    enabled: open && id !== "",
    retry: false,
  });

  const sourceDocumentId = ledgerEntry?.sourceDocumentId;

  const updateMutation = useLedgerMutation<
    void,
    Partial<Omit<LedgerEntry, "amount">> & { amount?: number }
  >(ledgerId, {
    mutationFn: async (data) => {
      await updateLedgerEntryAction(ledgerId, id, data);
    },
    errorMessage: null,
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    cancelPredicates: [invalidateLedgerEntries(ledgerId)],
    invalidatePredicates: [
      invalidateLedgerEntries(ledgerId),
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
  });

  const deleteMutation = useLedgerMutation<void, void>(ledgerId, {
    mutationFn: async () => {
      await deleteLedgerEntryAction(ledgerId, id);
    },
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    mutationReason: "delete",
    cancelPredicates: [invalidateLedgerEntries(ledgerId)],
    invalidatePredicates: [
      invalidateLedgerEntries(ledgerId),
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
  });

  // Handle error state - moved to useEffect to avoid render-path side effects
  useEffect(() => {
    if (error) {
      toast.error(tCommon("error"));
      onClose();
    }
  }, [error, onClose, tCommon]);

  // Handle deleted/not-found case - moved to useEffect
  useEffect(() => {
    if (!isLoading && !ledgerEntry && open) {
      onClose();
    }
  }, [isLoading, ledgerEntry, open, onClose]);

  // Always render Modal - pass isLoading for skeleton state
  return (
    <LedgerEntryDetailModal
      ledgerEntry={ledgerEntry ?? null}
      isLoading={isLoading}
      categories={categories}
      open={open}
      onClose={onClose}
      {...(onBack !== undefined ? { onBack } : {})}
      {...(onExitComplete !== undefined ? { onExitComplete } : {})}
      onUpdate={async (data) => await updateMutation.mutateAsync(data)}
      onDelete={async () => await deleteMutation.mutateAsync()}
      {...(sourceDocumentId != null && sourceDocumentId !== ""
        ? {
            onViewSourceDocument: () =>
              openLedgerDetail({
                type: "source-document",
                id: sourceDocumentId,
                ledgerId,
              }),
          }
        : {})}
    />
  );
}
