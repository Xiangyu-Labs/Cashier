"use client";

import { useTranslations } from "next-intl";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  matchPaginatedSourceDocuments,
} from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { updateLedgerEntryAction, deleteLedgerEntryAction } from "@/modules/ledger/actions";
import {
  deleteSourceDocumentAction,
  batchDeleteSourceDocumentsAction,
  type PaginatedSourceDocumentsResponse,
  type SourceDocumentWithEntries,
} from "@/modules/source-document/actions";
import type { LedgerEntry, EntryCategory } from "@/types/api";

type SourceDocumentsQueryData = PaginatedSourceDocumentsResponse | undefined;

export function useLedgerEntriesMutations(ledgerId: string, categories: EntryCategory[]) {
  const tCommon = useTranslations("Common");
  const t = useTranslations("LedgerEntriesTab");

  const updateEntry = useLedgerMutation<
    LedgerEntry,
    { ledgerEntryId: string; data: Partial<Omit<LedgerEntry, "amount">> & { amount?: number } }
  >(ledgerId, {
    mutationFn: async ({ ledgerEntryId, data }) => {
      const result = await updateLedgerEntryAction(ledgerId, ledgerEntryId, data);
      return result;
    },
    successMessage: tCommon("saveSuccess"),
    errorMessage: tCommon("saveFailed"),
    cancelPredicates: [invalidateSourceDocuments(ledgerId), invalidateLedgerEntries(ledgerId)],
    invalidatePredicates: [
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onOptimisticUpdate: (queryClient, { ledgerEntryId, data }) => {
      const snapshots = queryClient.getQueriesData<SourceDocumentsQueryData>({
        predicate: matchPaginatedSourceDocuments(ledgerId),
      });

      queryClient.setQueriesData<SourceDocumentsQueryData>(
        { predicate: matchPaginatedSourceDocuments(ledgerId) },
        (old) => {
          if (old === undefined || old.items === undefined) return old;
          return {
            ...old,
            items: old.items.map((doc) => {
              const updatedEntries =
                doc.ledgerEntries?.map((e) => {
                  if (e.id !== ledgerEntryId) return e;
                  const updated = {
                    ...e,
                    itemName: data.itemName ?? e.itemName,
                    description: data.description ?? e.description,
                    amount: data.amount !== undefined ? String(data.amount) : e.amount,
                    currency: data.currency ?? e.currency,
                    categoryId: data.categoryId ?? e.categoryId,
                    category:
                      data.categoryId != null && data.categoryId !== ""
                        ? categories.find((c) => c.id === data.categoryId) ?? e.category
                        : e.category,
                  };
                  return updated as typeof e;
                }) ?? [];
              return { ...doc, ledgerEntries: updatedEntries };
            }) as SourceDocumentWithEntries[],
          };
        }
      );

      return { snapshots };
    },
  });

  const deleteEntry = useLedgerMutation<void, string>(ledgerId, {
    mutationFn: (ledgerEntryId) => deleteLedgerEntryAction(ledgerId, ledgerEntryId),
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    cancelPredicates: [invalidateSourceDocuments(ledgerId), invalidateLedgerEntries(ledgerId)],
    invalidatePredicates: [
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onOptimisticUpdate: (queryClient, ledgerEntryId) => {
      const snapshots = queryClient.getQueriesData<SourceDocumentsQueryData>({
        predicate: matchPaginatedSourceDocuments(ledgerId),
      });

      queryClient.setQueriesData<SourceDocumentsQueryData>(
        { predicate: matchPaginatedSourceDocuments(ledgerId) },
        (old): SourceDocumentsQueryData => {
          if (old === undefined || old.items === undefined) return old;
          return {
            ...old,
            items: old.items.map((doc) => {
              const filteredEntries = doc.ledgerEntries?.filter((e) => e.id !== ledgerEntryId) ?? [];
              return { ...doc, ledgerEntries: filteredEntries };
            }),
          };
        }
      );

      return { snapshots };
    },
  });

  const deleteSourceDocument = useLedgerMutation<void, string>(ledgerId, {
    mutationFn: (sourceDocumentId) => deleteSourceDocumentAction(ledgerId, sourceDocumentId),
    successMessage: tCommon("deleteSuccess"),
    errorMessage: t("deleteFailed"),
    cancelPredicates: [invalidateSourceDocuments(ledgerId)],
    invalidatePredicates: [
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onOptimisticUpdate: (queryClient, id) => {
      const snapshots = queryClient.getQueriesData<SourceDocumentsQueryData>({
        predicate: matchPaginatedSourceDocuments(ledgerId),
      });

      queryClient.setQueriesData<SourceDocumentsQueryData>(
        { predicate: matchPaginatedSourceDocuments(ledgerId) },
        (old): SourceDocumentsQueryData => {
          if (old === undefined || old.items === undefined) return old;
          return {
            ...old,
            items: old.items.filter((d) => d.id !== id),
            total: old.total - 1,
          };
        }
      );

      return { snapshots };
    },
  });

  const batchDeleteSourceDocuments = useLedgerMutation<void, string[]>(ledgerId, {
    mutationFn: (ids) => batchDeleteSourceDocumentsAction(ledgerId, ids),
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    cancelPredicates: [invalidateSourceDocuments(ledgerId)],
    invalidatePredicates: [
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerEntries(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onOptimisticUpdate: (queryClient, ids) => {
      const snapshots = queryClient.getQueriesData<SourceDocumentsQueryData>({
        predicate: matchPaginatedSourceDocuments(ledgerId),
      });

      queryClient.setQueriesData<SourceDocumentsQueryData>(
        { predicate: matchPaginatedSourceDocuments(ledgerId) },
        (old) => {
          if (old === undefined || old.items === undefined) return old;
          return {
            ...old,
            items: old.items.filter((d) => !ids.includes(d.id)),
            total: old.total - ids.length,
          };
        }
      );

      return { snapshots };
    },
  });

  return {
    updateEntry,
    deleteEntry,
    deleteSourceDocument,
    batchDeleteSourceDocuments,
  };
}
