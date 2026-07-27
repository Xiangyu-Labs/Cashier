"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  invalidateCalendar,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  invalidateSourceDocumentStreamTotal,
} from "@/lib/query-keys";
import {
  deleteSourceDocumentAction,
  batchUpdateSourceDocumentsAction,
} from "@/modules/source-document/actions";

export function useBatchSourceDocumentActions(ledgerId: string, clearSelection: () => void) {
  const queryClient = useQueryClient();
  const tCommon = useTranslations("Common");
  const tBatch = useTranslations("BatchActions");

  const deleteSourceDocument = useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      const operationId = crypto.randomUUID();
      await deleteSourceDocumentAction(ledgerId, id, operationId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) });
      toast.success(tCommon("deleteSuccess"));
      clearSelection();
    },
    onError: () => {
      toast.error(tCommon("deleteFailed"));
    },
    onSettled: () => {
      // Targeted invalidation for derived data
      queryClient.invalidateQueries({
        predicate: invalidateLedgerStats(ledgerId),
      });
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentStreamTotal(ledgerId),
      });
      queryClient.invalidateQueries({
        predicate: invalidateCalendar(ledgerId),
      });
    },
  });

  const batchUpdateDates = useMutation<void, Error, { ids: string[]; entryDate: string }>({
    mutationFn: async ({ ids, entryDate }) => {
      await batchUpdateSourceDocumentsAction(ledgerId, ids, { entryDate });
    },
    onSuccess: async (_data, { ids }) => {
      await queryClient.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) });
      toast.success(tBatch("datesUpdated", { count: ids.length }));
      clearSelection();
    },
    onError: () => {
      toast.error(tCommon("error"));
    },
    onSettled: () => {
      // Targeted invalidation for derived data
      queryClient.invalidateQueries({
        predicate: invalidateLedgerStats(ledgerId),
      });
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentStreamTotal(ledgerId),
      });
      queryClient.invalidateQueries({
        predicate: invalidateCalendar(ledgerId),
      });
    },
  });

  return {
    deleteSourceDocument,
    batchUpdateDates,
  };
}
