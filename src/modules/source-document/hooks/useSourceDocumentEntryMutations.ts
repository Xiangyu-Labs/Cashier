"use client";
import {
  batchDeleteLedgerEntriesAction,
  batchUpdateLedgerEntriesAction,
} from "@/modules/ledger/server-actions/entries";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { useTranslations } from "next-intl";
import type { BatchActionResult } from "@/lib/batch-ids";
import { type BatchEntryUpdateData } from "./source-document-detail-cache";

type QueryPredicate = (query: { queryKey: readonly unknown[] }) => boolean;

interface UseSourceDocumentEntryMutationsOptions {
  id: string;
  ledgerId: string | undefined;
  sourceDocumentAndEntriesPredicates: QueryPredicate[] | null;
  sourceDocumentEntriesSummaryPredicates: QueryPredicate[] | null;
}

export function useSourceDocumentEntryMutations({
  id: _id,
  ledgerId,
  sourceDocumentAndEntriesPredicates,
  sourceDocumentEntriesSummaryPredicates,
}: UseSourceDocumentEntryMutationsOptions) {
  const tCommon = useTranslations("Common");

  const batchUpdateMutation = useLedgerMutation<
    { ledgerEntryIds: string[]; affectedCount: number } | undefined,
    { ids: string[]; data: BatchEntryUpdateData }
  >(ledgerId, {
    mutationFn: async ({ ids, data }) => {
      if (ledgerId == null || ledgerId === "") return;
      return batchUpdateLedgerEntriesAction(ledgerId, ids, data);
    },
    errorMessage: null,
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    ...(sourceDocumentAndEntriesPredicates !== null
      ? { cancelPredicates: sourceDocumentAndEntriesPredicates }
      : {}),
    ...(sourceDocumentEntriesSummaryPredicates !== null
      ? {
          invalidatePredicates: [
            ...(sourceDocumentAndEntriesPredicates ?? []),
            ...sourceDocumentEntriesSummaryPredicates,
          ],
        }
      : {}),
  });

  const batchDeleteMutation = useLedgerMutation<BatchActionResult, string[]>(ledgerId, {
    mutationFn: async (entryIds) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      return batchDeleteLedgerEntriesAction(ledgerId, entryIds);
    },
    successMessage: null,
    errorMessage: null,
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    ...(sourceDocumentAndEntriesPredicates !== null
      ? { cancelPredicates: sourceDocumentAndEntriesPredicates }
      : {}),
    ...(sourceDocumentEntriesSummaryPredicates !== null
      ? {
          invalidatePredicates: [
            ...(sourceDocumentAndEntriesPredicates ?? []),
            ...sourceDocumentEntriesSummaryPredicates,
          ],
        }
      : {}),
  });

  return {
    batchUpdateMutation,
    batchDeleteMutation,
  };
}
