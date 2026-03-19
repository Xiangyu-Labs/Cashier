"use client";

import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  invalidateTaskQueue,
} from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations";
import {
  batchUpdateLedgerEntriesAction,
  batchDeleteLedgerEntriesAction,
  submitBatchCategorizeAction,
} from "@/modules/ledger/actions";

export function useBatchEntryActions(ledgerId: string, clearSelection: () => void) {
  const tCommon = useTranslations("Common");
  const tBatch = useTranslations("BatchActions");

  const batchCategorize = useLedgerMutation(ledgerId, {
    mutationFn: async (ids: string[]) => {
      const result = await submitBatchCategorizeAction(ledgerId, ids);
      return result;
    },
    successMessage: "", // Custom message based on result
    errorMessage: tCommon("error"),
    cancelPredicates: [invalidateLedgerEntries(ledgerId)],
    invalidatePredicates: [invalidateTaskQueue(ledgerId)],
    onSuccessExtra: (result) => {
      if (result.submittedCount > 0) {
        toast.success(tBatch("aiCategorizeSubmitted", { count: result.submittedCount }));
      }
      if (result.skippedCount > 0) {
        toast.info(tBatch("aiCategorizeSkipped", { count: result.skippedCount }));
      }
      clearSelection();
    },
  });

  const batchChangeCategory = useLedgerMutation(ledgerId, {
    mutationFn: async ({ ids, categoryId }: { ids: string[]; categoryId: string | null }) => {
      await batchUpdateLedgerEntriesAction(ledgerId, ids, { categoryId });
    },
    successMessage: "", // Custom message with count
    errorMessage: tCommon("error"),
    cancelPredicates: [invalidateLedgerEntries(ledgerId)],
    invalidatePredicates: [
      invalidateLedgerEntries(ledgerId),
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onSuccessExtra: (_data, { ids }) => {
      toast.success(tBatch("categoryChanged", { count: ids.length }));
      clearSelection();
    },
  });

  const batchChangeCurrency = useLedgerMutation(ledgerId, {
    mutationFn: async ({ ids, currency }: { ids: string[]; currency: string }) => {
      await batchUpdateLedgerEntriesAction(ledgerId, ids, { currency });
    },
    successMessage: "",
    errorMessage: tCommon("error"),
    cancelPredicates: [invalidateLedgerEntries(ledgerId)],
    invalidatePredicates: [
      invalidateLedgerEntries(ledgerId),
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onSuccessExtra: (_data, { ids }) => {
      toast.success(tBatch("currencyChanged", { count: ids.length }));
      clearSelection();
    },
  });

  const batchDelete = useLedgerMutation(ledgerId, {
    mutationFn: async (ids: string[]) => {
      await batchDeleteLedgerEntriesAction(ledgerId, ids);
    },
    successMessage: "", // Custom message with count
    errorMessage: tCommon("error"),
    cancelPredicates: [invalidateLedgerEntries(ledgerId)],
    invalidatePredicates: [
      invalidateLedgerEntries(ledgerId),
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onSuccessExtra: (_data, ids) => {
      toast.success(tBatch("entriesDeleted", { count: ids.length }));
      clearSelection();
    },
  });

  return {
    batchCategorize,
    batchChangeCategory,
    batchChangeCurrency,
    batchDelete,
  };
}
