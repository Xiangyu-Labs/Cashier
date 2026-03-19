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
import type { LedgerEntry, EntryCategory } from "@/types/api";

type SourceDocumentCacheEntry = Pick<
  LedgerEntry,
  | "id"
  | "itemName"
  | "description"
  | "amount"
  | "currency"
  | "categoryId"
  | "convertedAmount"
  | "exchangeRate"
> & {
  category?: EntryCategory | null;
};

interface SourceDocumentCacheItem {
  ledgerEntries?: SourceDocumentCacheEntry[];
}

type SourceDocumentsQueryData = {
  items?: SourceDocumentCacheItem[];
} | undefined;

export function useLedgerEntriesMutations(ledgerId: string, categories: EntryCategory[]) {
  const tCommon = useTranslations("Common");

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
                  return updated;
                }) ?? [];
              return { ...doc, ledgerEntries: updatedEntries };
            }),
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

  return {
    updateEntry,
    deleteEntry,
  };
}
