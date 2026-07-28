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
  batchDeleteSourceDocumentsAction,
  batchRetrySourceDocumentsAction,
} from "@/modules/source-document/actions";
import type { BatchActionResult } from "@/lib/batch-ids";

export function useBatchSourceDocumentActions(
  ledgerId: string,
  clearSelection: () => void,
  retainSelection?: (ids: string[]) => void
) {
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

  const settleBatchResult = async (result: BatchActionResult, successLabel: string) => {
    await queryClient.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) });
    const unresolved = [...result.skipped, ...result.failed].map((item) => item.id);
    if (unresolved.length === 0) clearSelection();
    else retainSelection?.(unresolved);
    if (result.succeededIds.length > 0) toast.success(successLabel);
    if (unresolved.length > 0) {
      toast.warning(tBatch("partialResult", {
        succeeded: result.succeededIds.length,
        skipped: result.skipped.length,
        failed: result.failed.length,
      }));
    }
  };

  const batchDelete = useMutation<BatchActionResult, Error, string[]>({
    mutationFn: (ids) => batchDeleteSourceDocumentsAction(ledgerId, ids),
    onSuccess: (result) => settleBatchResult(result, tBatch("deleted", { count: result.succeededIds.length })),
    onError: () => toast.error(tCommon("deleteFailed")),
    onSettled: () => {
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) });
      queryClient.invalidateQueries({ predicate: invalidateSourceDocumentStreamTotal(ledgerId) });
      queryClient.invalidateQueries({ predicate: invalidateCalendar(ledgerId) });
    },
  });

  const batchRetry = useMutation<BatchActionResult, Error, string[]>({
    mutationFn: (ids) => batchRetrySourceDocumentsAction(ledgerId, ids),
    onSuccess: (result) => settleBatchResult(result, tBatch("retried", { count: result.succeededIds.length })),
    onError: () => toast.error(tCommon("error")),
  });

  return {
    deleteSourceDocument,
    batchUpdateDates,
    batchDelete,
    batchRetry,
  };
}
