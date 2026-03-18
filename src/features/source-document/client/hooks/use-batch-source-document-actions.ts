"use client";

import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  invalidateCalendar,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  invalidateTaskQueue,
  matchPaginatedSourceDocuments,
} from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  batchUpdateSourceDocumentsAction,
  batchDeleteSourceDocumentsAction,
  batchRetrySourceDocumentsAction,
} from "@/features/source-document/server/actions";

import type { PaginatedSourceDocumentsResponse } from "@/features/source-document/server/actions/types";

export function useBatchSourceDocumentActions(ledgerId: string, clearSelection: () => void) {
  const tCommon = useTranslations("Common");
  const tBatch = useTranslations("BatchActions");

  const batchUpdateDates = useLedgerMutation(ledgerId, {
    mutationFn: async ({ ids, entryDate }: { ids: string[]; entryDate: string }) => {
      await batchUpdateSourceDocumentsAction(ledgerId, ids, { entryDate });
    },
    successMessage: "",
    errorMessage: tCommon("error"),
    cancelPredicates: [invalidateSourceDocuments(ledgerId)],
    invalidatePredicates: [
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onSuccessExtra: (_data, { ids }) => {
      toast.success(tBatch("datesUpdated", { count: ids.length }));
      clearSelection();
    },
    onOptimisticUpdate: (queryClient, { ids, entryDate }) => {
      const snapshots = queryClient.getQueriesData<PaginatedSourceDocumentsResponse>({
        predicate: matchPaginatedSourceDocuments(ledgerId),
      });

      queryClient.setQueriesData<PaginatedSourceDocumentsResponse>(
        { predicate: matchPaginatedSourceDocuments(ledgerId) },
        (old) => {
          if (!old || !old.items) return old;
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
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onSuccessExtra: (_data, ids) => {
      toast.success(tBatch("entriesDeleted", { count: ids.length }));
      clearSelection();
    },
    onOptimisticUpdate: (queryClient, ids) => {
      const snapshots = queryClient.getQueriesData<PaginatedSourceDocumentsResponse>({
        predicate: matchPaginatedSourceDocuments(ledgerId),
      });

      queryClient.setQueriesData<PaginatedSourceDocumentsResponse>(
        { predicate: matchPaginatedSourceDocuments(ledgerId) },
        (old) => {
          if (!old || !old.items) return old;
          return {
            ...old,
            items: old.items.filter((doc) => !ids.includes(doc.id)),
            total: old.total - ids.length,
          };
        }
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
      const snapshots = queryClient.getQueriesData<PaginatedSourceDocumentsResponse>({
        predicate: matchPaginatedSourceDocuments(ledgerId),
      });

      // Move documents to 'queued' status
      queryClient.setQueriesData<PaginatedSourceDocumentsResponse>(
        { predicate: matchPaginatedSourceDocuments(ledgerId) },
        (old) => {
          if (!old || !old.items) return old;
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
    batchUpdateDates,
    batchDelete,
    batchRetry,
  };
}
