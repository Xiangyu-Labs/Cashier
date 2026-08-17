"use client";
import type {
  LedgerEntry,
  LedgerEntryDto,
  DeleteLedgerEntryResultDto,
} from "@/modules/ledger/contracts";
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
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { applySourceDocumentReconciliation } from "@/modules/source-document/hooks/source-document-optimistic-cache";
import type {
  MutationReconciliation,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";
import { LedgerEntryDetailModal } from "./LedgerEntryDetailModal";
import { withQueryTimeout } from "@/lib/query-timeout";

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

  const query = useQuery({
    queryKey: queryKeys.ledgerEntry(ledgerId, id),
    queryFn: () => withQueryTimeout(getLedgerEntryAction(ledgerId, id)),
    enabled: open && id !== "",
    retry: false,
  });
  const { data: ledgerEntry, isLoading, error } = query;
  const loadError = error != null || (!isLoading && ledgerEntry == null);

  const sourceDocumentId = ledgerEntry?.sourceDocumentId;

  const updateMutation = useLedgerMutation<
    LedgerEntryDto & Partial<{ reconciliation: MutationReconciliation<SourceDocumentListItemDto> }>,
    Partial<Omit<LedgerEntry, "amount">> & { amount?: number }
  >(ledgerId, {
    mutationFn: async (data) => {
      const operationId = crypto.randomUUID();
      return updateLedgerEntryAction(ledgerId, id, data, operationId);
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
    onSuccessReconcile: (client, result) => {
      if (sourceDocumentId == null || sourceDocumentId === "") return;
      applySourceDocumentReconciliation(client, ledgerId, sourceDocumentId, result?.reconciliation);
    },
  });

  const deleteMutation = useLedgerMutation<DeleteLedgerEntryResultDto, void>(ledgerId, {
    mutationFn: async () => {
      const operationId = crypto.randomUUID();
      return deleteLedgerEntryAction(ledgerId, id, operationId);
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
    onSuccessReconcile: (client, result) => {
      if (sourceDocumentId == null || sourceDocumentId === "") return;
      applySourceDocumentReconciliation(client, ledgerId, sourceDocumentId, result.reconciliation);
    },
  });

  const handleReload = useCallback(async () => {
    const result = await query.refetch();
    if (result.error != null || result.data == null) {
      throw result.error ?? new Error("Ledger entry is unavailable");
    }
  }, [query]);

  // Always render Modal - pass isLoading for skeleton state
  return (
    <LedgerEntryDetailModal
      ledgerEntry={ledgerEntry ?? null}
      isLoading={isLoading}
      loadError={loadError}
      onReload={handleReload}
      categories={categories}
      open={open}
      onClose={onClose}
      {...(onBack !== undefined ? { onBack } : {})}
      {...(onExitComplete !== undefined ? { onExitComplete } : {})}
      onUpdate={async (data) => {
        await updateMutation.mutateAsync(data);
      }}
      onDelete={async () => {
        await deleteMutation.mutateAsync();
      }}
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
