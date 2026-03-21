"use client";
import { type QueryClient } from "@tanstack/react-query";
import {
  batchDeleteLedgerEntriesAction,
  batchUpdateLedgerEntriesAction,
  deleteLedgerEntryAction,
  updateLedgerEntryAction,
} from "@/modules/ledger/actions";
import { queryKeys } from "@/lib/query-keys";
import { fireAndForget } from "@/lib/safe-async";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { useTranslations } from "next-intl";
import type { EntryEditData } from "@/modules/source-document/types";
import {
  type BatchEntryUpdateData,
  createSourceDocSnapshots,
  removeBatchEntriesFromCaches,
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

function invalidateDetail(queryClient: QueryClient, id: string) {
  fireAndForget(queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }), {
    context: "SourceDocumentDetailWrapper",
  });
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
        ...(data.amount !== undefined ? { amount: parseFloat(data.amount) } : {}),
      };
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
    onSettledExtra: (queryClient) => invalidateDetail(queryClient, id),
  });

  const batchUpdateMutation = useLedgerMutation<void, { ids: string[]; data: BatchEntryUpdateData }>(
    ledgerId,
    {
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
      onSettledExtra: (queryClient) => invalidateDetail(queryClient, id),
    }
  );

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
    onSettledExtra: (queryClient) => invalidateDetail(queryClient, id),
  });

  const batchDeleteMutation = useLedgerMutation<void, string[]>(ledgerId, {
    mutationFn: async (ids) => {
      if (ledgerId == null || ledgerId === "") return;
      await batchDeleteLedgerEntriesAction(ledgerId, ids);
    },
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    ...(sourceDocumentAndEntriesPredicates !== null
      ? { cancelPredicates: sourceDocumentAndEntriesPredicates }
      : {}),
    ...(sourceDocumentEntriesSummaryPredicates !== null
      ? { invalidatePredicates: sourceDocumentEntriesSummaryPredicates }
      : {}),
    onOptimisticUpdate: (queryClient, ids) => {
      const snapshots = createSourceDocSnapshots(queryClient, id, ledgerId);
      removeBatchEntriesFromCaches(queryClient, id, ledgerId, ids);
      return { snapshots };
    },
    onSettledExtra: (queryClient) => invalidateDetail(queryClient, id),
  });

  return {
    updateEntryMutation,
    batchUpdateMutation,
    deleteEntryMutation,
    batchDeleteMutation,
  };
}
