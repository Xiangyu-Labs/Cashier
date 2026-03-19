"use client";

import { useTranslations } from "next-intl";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  matchLedgerEntries,
  queryKeys,
} from "@/lib/query-keys";
import { useLedgerMutation, createListSnapshots } from "@/lib/mutations/use-ledger-mutation";
import { updateLedgerEntryAction, deleteLedgerEntryAction } from "@/modules/ledger/actions";
import type { DeleteLedgerEntryResultDto } from "@/modules/ledger/contracts";
import type { LedgerEntry, EntryCategory } from "@/types/api";

interface UseEntryMutationsParams {
  ledgerId: string;
  categories: EntryCategory[];
  selectedLedgerEntry: LedgerEntry | null;
  setSelectedLedgerEntry: (entry: LedgerEntry | null) => void;
  setIsDetailModalOpen: (open: boolean) => void;
}

interface InfiniteData {
  pages: { items?: LedgerEntry[] }[];
  pageParams?: unknown[];
}

function getUpdatedCategory(
  entry: LedgerEntry,
  categoryId: string | null | undefined,
  categories: EntryCategory[]
) {
  if (categoryId == null || categoryId === "") {
    return entry.category;
  }

  return categories.find((category) => category.id === categoryId) ?? entry.category;
}

function buildOptimisticLedgerEntry(
  entry: LedgerEntry,
  data: Partial<Omit<LedgerEntry, "amount">> & { amount?: number },
  categories: EntryCategory[]
): LedgerEntry {
  const nextCategory = getUpdatedCategory(entry, data.categoryId, categories);
  const updatedEntry: LedgerEntry = {
    ...entry,
    ...(data.itemName !== undefined ? { itemName: data.itemName } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.amount !== undefined ? { amount: String(data.amount) } : {}),
    ...(data.currency !== undefined ? { currency: data.currency } : {}),
    ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
  };

  return nextCategory !== undefined ? { ...updatedEntry, category: nextCategory } : updatedEntry;
}

export function useEntryMutations({
  ledgerId,
  categories,
  selectedLedgerEntry,
  setSelectedLedgerEntry,
  setIsDetailModalOpen,
}: UseEntryMutationsParams) {
  const tCommon = useTranslations("Common");
  const tLedger = useTranslations("LedgerEntriesTab");

  const updateEntry = useLedgerMutation<
    LedgerEntry,
    { ledgerEntryId: string; data: Partial<Omit<LedgerEntry, "amount">> & { amount?: number } }
  >(ledgerId, {
    mutationFn: async ({ ledgerEntryId, data }) => {
      const result = await updateLedgerEntryAction(ledgerId, ledgerEntryId, data);
      return result;
    },
    errorMessage: tCommon("saveFailed"),
    cancelPredicates: [invalidateLedgerEntries(ledgerId)],
    invalidatePredicates: [
      invalidateLedgerEntries(ledgerId),
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onOptimisticUpdate: (queryClient, { ledgerEntryId, data }) => {
      const snapshots = createListSnapshots<InfiniteData>(
        queryClient,
        queryKeys.ledgerEntries(ledgerId)
      );

      queryClient.setQueriesData<InfiniteData>(
        { predicate: matchLedgerEntries(ledgerId) },
        (old): InfiniteData | undefined => {
          if (old == null) return old;
          return {
            ...old,
            pages: old.pages.map((page) => {
              if (page.items === undefined) {
                return page;
              }

              return {
                ...page,
                items: page.items.map((entry) =>
                  entry.id === ledgerEntryId
                    ? buildOptimisticLedgerEntry(entry, data, categories)
                    : entry
                ),
              };
            }),
          };
        }
      );

      // Also update selected entry immediately for modal
      if (selectedLedgerEntry && selectedLedgerEntry.id === ledgerEntryId) {
        setSelectedLedgerEntry(buildOptimisticLedgerEntry(selectedLedgerEntry, data, categories));
      }

      return { snapshots };
    },
  });

  const deleteEntry = useLedgerMutation<DeleteLedgerEntryResultDto, string>(ledgerId, {
    mutationFn: (ledgerEntryId) => deleteLedgerEntryAction(ledgerId, ledgerEntryId),
    successMessage: tLedger("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    cancelPredicates: [invalidateLedgerEntries(ledgerId)],
    invalidatePredicates: [
      invalidateLedgerEntries(ledgerId),
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onSuccessExtra: () => {
      setIsDetailModalOpen(false);
      setSelectedLedgerEntry(null);
    },
    onOptimisticUpdate: (queryClient, ledgerEntryId) => {
      const snapshots = createListSnapshots<InfiniteData>(
        queryClient,
        queryKeys.ledgerEntries(ledgerId)
      );

      queryClient.setQueriesData<InfiniteData>(
        { predicate: matchLedgerEntries(ledgerId) },
        (old): InfiniteData | undefined => {
          if (old == null) return old;
          return {
            ...old,
            pages: old.pages.map((page) => {
              if (page.items === undefined) {
                return page;
              }

              return {
                ...page,
                items: page.items.filter((entry) => entry.id !== ledgerEntryId),
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
