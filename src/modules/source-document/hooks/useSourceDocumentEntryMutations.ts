"use client";
import {
  batchUpdateLedgerEntriesAction,
  deleteLedgerEntryAction,
  updateLedgerEntryAction,
} from "@/modules/ledger/actions";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { round } from "@/lib/money/decimal";
import { useTranslations } from "next-intl";
import type { EntryEditData } from "@/modules/source-document/types";
import {
  type BatchEntryUpdateData,
  createSourceDocSnapshots,
  removeSingleEntryFromCaches,
  updateBatchEntriesInCaches,
  updateSingleEntryInCaches,
} from "./source-document-detail-cache";

type QueryPredicate = (query: { queryKey: readonly unknown[] }) => boolean;

interface UseSourceDocumentEntryMutationsOptions {
  id: string;
  ledgerId: string | undefined;
  sourceDocumentAndEntriesPredicates: QueryPredicate[] | null;
  sourceDocumentEntriesSummaryPredicates: QueryPredicate[] | null;
}

export function useSourceDocumentEntryMutations({
  id,
  ledgerId,
  sourceDocumentAndEntriesPredicates,
  sourceDocumentEntriesSummaryPredicates,
}: UseSourceDocumentEntryMutationsOptions) {
  const tCommon = useTranslations("Common");

  const updateEntryMutation = useLedgerMutation<
    void,
    { entryId: string; data: Partial<EntryEditData> }
  >(ledgerId, {
    mutationFn: async ({ entryId, data }) => {
      if (ledgerId == null || ledgerId === "") return;
      const mutationData = {
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.itemName !== undefined ? { itemName: data.itemName } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.amount !== undefined ? { amount: Number(round(data.amount, 2)) } : {}),
      };
      // Note: round() ensures canonical decimal precision before converting to Number
      // for the server action boundary. The server action will re-round to 2 decimals.
      await updateLedgerEntryAction(ledgerId, entryId, mutationData);
    },
    errorMessage: tCommon("saveFailed"),
    ...(sourceDocumentAndEntriesPredicates !== null
      ? { cancelPredicates: sourceDocumentAndEntriesPredicates }
      : {}),
    ...(sourceDocumentEntriesSummaryPredicates !== null
      ? { invalidatePredicates: sourceDocumentEntriesSummaryPredicates }
      : {}),
    onOptimisticUpdate: (queryClient, { entryId, data }) => {
      const snapshots = createSourceDocSnapshots(queryClient, id, ledgerId);
      updateSingleEntryInCaches(queryClient, id, ledgerId, entryId, data);
      return { snapshots };
    },
  });

  const batchUpdateMutation = useLedgerMutation<
    void,
    { ids: string[]; data: BatchEntryUpdateData }
  >(ledgerId, {
    mutationFn: async ({ ids, data }) => {
      if (ledgerId == null || ledgerId === "") return;
      await batchUpdateLedgerEntriesAction(ledgerId, ids, data);
    },
    errorMessage: tCommon("saveFailed"),
    ...(sourceDocumentAndEntriesPredicates !== null
      ? { cancelPredicates: sourceDocumentAndEntriesPredicates }
      : {}),
    ...(sourceDocumentEntriesSummaryPredicates !== null
      ? { invalidatePredicates: sourceDocumentEntriesSummaryPredicates }
      : {}),
    onOptimisticUpdate: (queryClient, { ids, data }) => {
      const snapshots = createSourceDocSnapshots(queryClient, id, ledgerId);
      updateBatchEntriesInCaches(queryClient, id, ledgerId, ids, data);
      return { snapshots };
    },
  });

  const deleteEntryMutation = useLedgerMutation<void, string>(ledgerId, {
    mutationFn: async (entryId) => {
      if (ledgerId == null || ledgerId === "") return;
      await deleteLedgerEntryAction(ledgerId, entryId);
    },
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    ...(sourceDocumentAndEntriesPredicates !== null
      ? { cancelPredicates: sourceDocumentAndEntriesPredicates }
      : {}),
    ...(sourceDocumentEntriesSummaryPredicates !== null
      ? { invalidatePredicates: sourceDocumentEntriesSummaryPredicates }
      : {}),
    onOptimisticUpdate: (queryClient, entryId) => {
      const snapshots = createSourceDocSnapshots(queryClient, id, ledgerId);
      removeSingleEntryFromCaches(queryClient, id, ledgerId, entryId);
      return { snapshots };
    },
  });

  return {
    updateEntryMutation,
    batchUpdateMutation,
    deleteEntryMutation,
  };
}
