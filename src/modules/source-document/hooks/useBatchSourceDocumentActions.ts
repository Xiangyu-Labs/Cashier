"use client";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocumentAttention,
  invalidateSourceDocumentCompleted,
  invalidateSourceDocumentCounts,
  invalidateSourceDocuments,
  matchSourceDocumentCollection,
  queryKeys,
} from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  deleteSourceDocumentAction,
  batchUpdateSourceDocumentsAction,
} from "@/modules/source-document/actions";
import type { SourceDocumentAttentionDto, SourceDocumentCollectionDto } from "@/modules/source-document/contracts";

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
      invalidateLedgerEntries(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onOptimisticUpdate: (queryClient, id) => {
      // Snapshot and update legacy collection caches
      const collectionSnapshots = queryClient.getQueriesData<SourceDocumentCollectionDto>({
        predicate: matchSourceDocumentCollection(ledgerId),
      });

      queryClient.setQueriesData<SourceDocumentCollectionDto>(
        { predicate: matchSourceDocumentCollection(ledgerId) },
        (old) => {
          if (old === undefined || old.items === undefined) return old;
          return {
            ...old,
            items: old.items.filter((doc) => doc.id !== id),
            total: Math.max(0, old.total - 1),
          };
        }
      );

      // Snapshot and update attention cache
      const attentionSnapshots = queryClient.getQueriesData<SourceDocumentAttentionDto>({
        queryKey: queryKeys.sourceDocumentAttention(ledgerId),
      });

      queryClient.setQueryData<SourceDocumentAttentionDto>(
        queryKeys.sourceDocumentAttention(ledgerId),
        (old) => {
          if (old === undefined) return old;
          return {
            ...old,
            items: old.items.filter((doc) => doc.id !== id),
            total: Math.max(0, old.total - 1),
          };
        }
      );

      return { snapshots: [...collectionSnapshots, ...attentionSnapshots] };
    },
    onSettledExtra: (queryClient) => {
      // Invalidate new caches after mutation settles
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentAttention(ledgerId),
      });
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentCompleted(ledgerId),
      });
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentCounts(ledgerId),
      });
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
      invalidateLedgerEntries(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onSuccessExtra: (_data, { ids }) => {
      toast.success(tBatch("datesUpdated", { count: ids.length }));
      clearSelection();
    },
    onOptimisticUpdate: (queryClient, { ids, entryDate }) => {
      const collectionSnapshots = queryClient.getQueriesData<SourceDocumentCollectionDto>({
        predicate: matchSourceDocumentCollection(ledgerId),
      });

      // Update legacy collection caches
      queryClient.setQueriesData<SourceDocumentCollectionDto>(
        { predicate: matchSourceDocumentCollection(ledgerId) },
        (old) => {
          if (old === undefined || old.items === undefined) return old;
          return {
            ...old,
            items: old.items.map((doc) => (ids.includes(doc.id) ? { ...doc, entryDate } : doc)),
          };
        }
      );

      // Snapshot and update attention cache
      const attentionSnapshots = queryClient.getQueriesData<SourceDocumentAttentionDto>({
        queryKey: queryKeys.sourceDocumentAttention(ledgerId),
      });

      queryClient.setQueryData<SourceDocumentAttentionDto>(
        queryKeys.sourceDocumentAttention(ledgerId),
        (old) => {
          if (old === undefined) return old;
          return {
            ...old,
            items: old.items.map((doc) => (ids.includes(doc.id) ? { ...doc, entryDate } : doc)),
          };
        }
      );

      return { snapshots: [...collectionSnapshots, ...attentionSnapshots] };
    },
    onSettledExtra: (queryClient) => {
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentAttention(ledgerId),
      });
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentCounts(ledgerId),
      });
    },
  });

  return {
    deleteSourceDocument,
    batchUpdateDates,
  };
}
