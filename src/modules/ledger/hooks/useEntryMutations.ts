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
  pages?: { items?: LedgerEntry[] }[];
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
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items?.map((e) =>
                e.id === ledgerEntryId
                  ? ({
                      ...e,
                      ...data,
                      amount: data.amount !== undefined ? String(data.amount) : e.amount,
                      category:
                        data.categoryId != null && data.categoryId !== ""
                          ? (categories.find((c) => c.id === data.categoryId) ?? e.category)
                          : e.category,
                    } satisfies LedgerEntry)
                  : e
              ),
            })),
          };
        }
      );

      // Also update selected entry immediately for modal
      if (selectedLedgerEntry && selectedLedgerEntry.id === ledgerEntryId) {
        setSelectedLedgerEntry({
          ...selectedLedgerEntry,
          ...data,
          amount: data.amount !== undefined ? String(data.amount) : selectedLedgerEntry.amount,
          category:
            data.categoryId != null && data.categoryId !== ""
              ? (categories.find((c) => c.id === data.categoryId) ?? selectedLedgerEntry.category)
              : selectedLedgerEntry.category,
        } satisfies LedgerEntry);
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
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items?.filter((e) => e.id !== ledgerEntryId),
            })),
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
