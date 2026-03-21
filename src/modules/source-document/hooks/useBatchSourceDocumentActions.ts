"use client";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  invalidateTaskQueue,
  matchPaginatedSourceDocuments,
} from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  deleteSourceDocumentAction,
  batchUpdateSourceDocumentsAction,
  batchDeleteSourceDocumentsAction,
  batchRetrySourceDocumentsAction,
  type SourceDocumentCollectionDto,
} from "@/modules/source-document/actions";

function removeSourceDocumentsFromPaginatedLists(
  old: SourceDocumentCollectionDto | undefined,
  ids: string[]
): SourceDocumentCollectionDto | undefined {
  if (old === undefined || old.items === undefined) return old;

  return {
    ...old,
    items: old.items.filter((doc) => !ids.includes(doc.id)),
    total: Math.max(0, old.total - ids.length),
  };
}

export function useBatchSourceDocumentActions(ledgerId: string, clearSelection: () => void) {
  const tCommon = useTranslations("Common");
  const tBatch = useTranslations("BatchActions");

  const deleteSourceDocument = useLedgerMutation(ledgerId, {
    mutationFn: async (id: string) => {
      await deleteSourceDocumentAction(ledgerId, id);
    },
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    cancelPredicates: [invalidateSourceDocuments(ledgerId)],
    invalidatePredicates: [
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onOptimisticUpdate: (queryClient, id) => {
      const snapshots = queryClient.getQueriesData<SourceDocumentCollectionDto>({
        predicate: matchPaginatedSourceDocuments(ledgerId),
      });

      queryClient.setQueriesData<SourceDocumentCollectionDto>(
        { predicate: matchPaginatedSourceDocuments(ledgerId) },
        (old) => removeSourceDocumentsFromPaginatedLists(old, [id])
      );

      return { snapshots };
    },
  });

  const batchUpdateDates = useLedgerMutation(ledgerId, {
    mutationFn: async ({ ids, entryDate }: { ids: string[]; entryDate: string }) => {
      await batchUpdateSourceDocumentsAction(ledgerId, ids, { entryDate });
    },
    successMessage: "",
    errorMessage: tCommon("error"),
    cancelPredicates: [invalidateSourceDocuments(ledgerId)],
    invalidatePredicates: [
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onSuccessExtra: (_data, { ids }) => {
      toast.success(tBatch("datesUpdated", { count: ids.length }));
      clearSelection();
    },
    onOptimisticUpdate: (queryClient, { ids, entryDate }) => {
      const snapshots = queryClient.getQueriesData<SourceDocumentCollectionDto>({
        predicate: matchPaginatedSourceDocuments(ledgerId),
      });

      queryClient.setQueriesData<SourceDocumentCollectionDto>(
        { predicate: matchPaginatedSourceDocuments(ledgerId) },
        (old) => {
          if (old === undefined || old.items === undefined) return old;
          return {
            ...old,
            items: old.items.map((doc) => (ids.includes(doc.id) ? { ...doc, entryDate } : doc)),
          };
        }
      );

      return { snapshots };
    },
  });

  const batchDelete = useLedgerMutation(ledgerId, {
    mutationFn: async (ids: string[]) => {
      await batchDeleteSourceDocumentsAction(ledgerId, ids);
    },
    successMessage: "",
    errorMessage: tCommon("error"),
    cancelPredicates: [invalidateSourceDocuments(ledgerId)],
    invalidatePredicates: [
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onSuccessExtra: (_data, ids) => {
      toast.success(tBatch("entriesDeleted", { count: ids.length }));
      clearSelection();
    },
    onOptimisticUpdate: (queryClient, ids) => {
      const snapshots = queryClient.getQueriesData<SourceDocumentCollectionDto>({
        predicate: matchPaginatedSourceDocuments(ledgerId),
      });

      queryClient.setQueriesData<SourceDocumentCollectionDto>(
        { predicate: matchPaginatedSourceDocuments(ledgerId) },
        (old) => removeSourceDocumentsFromPaginatedLists(old, ids)
      );

      return { snapshots };
    },
  });

  const batchRetry = useLedgerMutation(ledgerId, {
    mutationFn: async (ids: string[]) => {
      await batchRetrySourceDocumentsAction(ledgerId, ids);
    },
    successMessage: "",
    errorMessage: tCommon("error"),
    cancelPredicates: [invalidateSourceDocuments(ledgerId), invalidateTaskQueue(ledgerId)],
    invalidatePredicates: [invalidateSourceDocuments(ledgerId), invalidateTaskQueue(ledgerId)],
    onSuccessExtra: (_data, ids) => {
      toast.success(tBatch("retrySubmitted", { count: ids.length }));
      clearSelection();
    },
    onOptimisticUpdate: (queryClient, ids) => {
      const snapshots = queryClient.getQueriesData<SourceDocumentCollectionDto>({
        predicate: matchPaginatedSourceDocuments(ledgerId),
      });

      queryClient.setQueriesData<SourceDocumentCollectionDto>(
        { predicate: matchPaginatedSourceDocuments(ledgerId) },
        (old) => {
          if (old === undefined || old.items === undefined) return old;
          return {
            ...old,
            items: old.items.map((doc) =>
              ids.includes(doc.id) ? { ...doc, status: "queued" as const } : doc
            ),
          };
        }
      );

      return { snapshots };
    },
  });

  return {
    deleteSourceDocument,
    batchUpdateDates,
    batchDelete,
    batchRetry,
  };
}
