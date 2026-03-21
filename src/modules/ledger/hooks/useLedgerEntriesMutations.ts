"use client";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { useTranslations } from "next-intl";
import { invalidateCalendar, invalidateLedgerEntries, invalidateLedgerStats, invalidateSourceDocuments, matchPaginatedSourceDocuments, } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { updateLedgerEntryAction, deleteLedgerEntryAction } from "@/modules/ledger/actions";
import type { DeleteLedgerEntryResultDto } from "@/modules/ledger/contracts";
import type { LedgerEntry } from "@/modules/ledger/contracts";

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

type SourceDocumentsQueryData =
  | {
      items?: SourceDocumentCacheItem[];
    }
  | undefined;

function getUpdatedCacheCategory(
  entry: SourceDocumentCacheEntry,
  categoryId: string | null | undefined,
  categories: EntryCategory[]
) {
  if (categoryId == null || categoryId === "") {
    return entry.category;
  }

  return categories.find((category) => category.id === categoryId) ?? entry.category;
}

function buildOptimisticCacheEntry(
  entry: SourceDocumentCacheEntry,
  data: Partial<Omit<LedgerEntry, "amount">> & { amount?: number },
  categories: EntryCategory[]
): SourceDocumentCacheEntry {
  const nextCategory = getUpdatedCacheCategory(entry, data.categoryId, categories);
  const updatedEntry: SourceDocumentCacheEntry = {
    ...entry,
    ...(data.itemName !== undefined ? { itemName: data.itemName } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.amount !== undefined ? { amount: String(data.amount) } : {}),
    ...(data.currency !== undefined ? { currency: data.currency } : {}),
    ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
  };

  return nextCategory !== undefined ? { ...updatedEntry, category: nextCategory } : updatedEntry;
}

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
        (old): SourceDocumentsQueryData => {
          if (old === undefined || old.items === undefined) return old;
          return {
            ...old,
            items: old.items.map((doc) => {
              if (doc.ledgerEntries === undefined) {
                return doc;
              }

              return {
                ...doc,
                ledgerEntries: doc.ledgerEntries.map((entry) =>
                  entry.id === ledgerEntryId
                    ? buildOptimisticCacheEntry(entry, data, categories)
                    : entry
                ),
              };
            }),
          };
        }
      );

      return { snapshots };
    },
  });

  const deleteEntry = useLedgerMutation<DeleteLedgerEntryResultDto, string>(ledgerId, {
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
              if (doc.ledgerEntries === undefined) {
                return doc;
              }

              return {
                ...doc,
                ledgerEntries: doc.ledgerEntries.filter((entry) => entry.id !== ledgerEntryId),
              };
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
