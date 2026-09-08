"use client";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getLedgerEntryAction } from "@/modules/ledger/server-actions/get-entry";
import {
  updateLedgerEntryAction,
  deleteLedgerEntryAction,
} from "@/modules/ledger/server-actions/entries";
import { openLedgerDetail } from "@/lib/navigation/ledger-detail-navigation";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { LedgerEntryDetailModal } from "./LedgerEntryDetailModal";
import { withQueryTimeout } from "@/lib/query-timeout";
import { unwrapVersionedCommandResult } from "@/modules/source-document/command-results";

interface LedgerEntryDetailWrapperProps {
  id: string;
  ledgerId: string;
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  onExitComplete?: () => void;
  categories: EntryCategory[];
  mainCurrency: string;
  preferredCurrencies: string[];
}

export function LedgerEntryDetailWrapper({
  id,
  ledgerId,
  open,
  onClose,
  onBack,
  onExitComplete,
  categories,
  mainCurrency,
  preferredCurrencies,
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
    { ledgerEntryId: string },
    {
      data: Partial<Omit<LedgerEntry, "amount">> & { amount?: number };
      expectedVersion: number | undefined;
      onCommitted: () => void;
    }
  >(ledgerId, {
    invalidates: ["documents", "stats"],
    mutationFn: async ({ data, expectedVersion }) => {
      if (ledgerEntry?.sourceDocument == null) throw new Error("Entry has no source document");
      if (expectedVersion == null) throw new Error("Entry has no edit version");
      const { amount, ...rest } = data;
      const result = await updateLedgerEntryAction(
        ledgerId,
        {
          sourceDocumentId: ledgerEntry.sourceDocument.id,
          expectedVersion,
        },
        id,
        { ...rest, ...(amount == null ? {} : { amount: String(amount) }) }
      );
      return unwrapVersionedCommandResult(result);
    },
    errorMessage: null,
    onSuccess: (_result, { onCommitted }) => onCommitted(),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  const deleteMutation = useLedgerMutation<
    { ledgerEntryId: string; deleted: true },
    void | (() => void)
  >(ledgerId, {
    invalidates: ["documents", "stats"],
    mutationFn: async () => {
      if (ledgerEntry?.sourceDocument == null) throw new Error("Entry has no source document");
      const result = await deleteLedgerEntryAction(
        ledgerId,
        {
          sourceDocumentId: ledgerEntry.sourceDocument.id,
          expectedVersion: ledgerEntry.sourceDocument.version,
        },
        id
      );
      return unwrapVersionedCommandResult(result);
    },
    successMessage: tCommon("deleteSuccess"),
    onSuccess: (_result, onCommitted) => onCommitted?.(),
    errorMessage: tCommon("deleteFailed"),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
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
      entryId={id}
      ledgerEntry={ledgerEntry ?? null}
      isLoading={isLoading}
      loadError={loadError}
      onReload={handleReload}
      categories={categories}
      mainCurrency={mainCurrency}
      preferredCurrencies={preferredCurrencies}
      open={open}
      onClose={onClose}
      {...(onBack !== undefined ? { onBack } : {})}
      {...(onExitComplete !== undefined ? { onExitComplete } : {})}
      onUpdate={async (data, context) => {
        await updateMutation.mutateAsync({ data, ...context });
      }}
      onDelete={async (onCommitted) => {
        await deleteMutation.mutateAsync(onCommitted);
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
