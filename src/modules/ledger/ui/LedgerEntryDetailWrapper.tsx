"use client";
import type {
  LedgerEntry,
  LedgerEntryDto,
  DeleteLedgerEntryResultDto,
} from "@/modules/ledger/contracts";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getLedgerEntryAction } from "@/modules/ledger/actions";
import { updateLedgerEntryAction, deleteLedgerEntryAction } from "@/modules/ledger/actions";
import { openLedgerDetail } from "@/lib/navigation/ledger-detail-navigation";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import type { EntryCategory } from "@/modules/ledger/contracts";
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
    LedgerEntryDto,
    Partial<Omit<LedgerEntry, "amount">> & { amount?: number }
  >(ledgerId, {
    mutationFn: async (data) => {
      const operationId = crypto.randomUUID();
      const { amount, ...rest } = data;
      return updateLedgerEntryAction(
        ledgerId,
        id,
        { ...rest, ...(amount == null ? {} : { amount: String(amount) }) },
        operationId
      );
    },
    errorMessage: null,
    resourceGroups: ["entries"],
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  const deleteMutation = useLedgerMutation<DeleteLedgerEntryResultDto, void>(ledgerId, {
    mutationFn: async () => {
      const operationId = crypto.randomUUID();
      return deleteLedgerEntryAction(ledgerId, id, operationId);
    },
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    resourceGroups: ["entries"],
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
