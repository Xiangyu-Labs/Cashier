"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  invalidateSourceDocumentStreamTotal,
} from "@/lib/query-keys";
import {
  deleteSourceDocumentAction,
  batchUpdateSourceDocumentsAction,
  batchDeleteSourceDocumentsAction,
  batchResolveDuplicateReviewsAction,
  batchRetrySourceDocumentsAction,
} from "@/modules/source-document/actions";
import type { BatchActionResult } from "@/lib/batch-ids";
import { runBackgroundQueryRefresh } from "@/lib/mutations/background-query-refresh";
import type { BatchUpdateSourceDocumentsResultDto } from "@/modules/source-document/contracts";
import { useNotifyRevisionRefresh } from "./revision-state-refresh";

type DuplicateBatchVariables =
  | string[]
  | {
      ids: string[];
      preserveIds: string[];
    };

function getDuplicateBatchVariables(variables: DuplicateBatchVariables) {
  return Array.isArray(variables) ? { ids: variables, preserveIds: [] } : variables;
}

export function useBatchSourceDocumentActions(
  ledgerId: string,
  clearSelection: () => void,
  retainSelection?: (ids: string[]) => void
) {
  const queryClient = useQueryClient();
  const tCommon = useTranslations("Common");
  const tBatch = useTranslations("BatchActions");
  const notifyRefresh = useNotifyRevisionRefresh();

  const deleteSourceDocument = useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      const operationId = crypto.randomUUID();
      await deleteSourceDocumentAction(ledgerId, id, operationId);
    },
    onSuccess: () => {
      notifyRefresh();
      toast.success(tCommon("deleteSuccess"));
      clearSelection();
      refreshDerivedQueries("batch source-document delete refresh");
    },
    onError: () => {
      toast.error(tCommon("deleteFailed"));
    },
  });

  const settleDerivedQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries(
        { predicate: invalidateSourceDocuments(ledgerId) },
        { throwOnError: true }
      ),
      queryClient.invalidateQueries(
        { predicate: invalidateLedgerEntries(ledgerId) },
        { throwOnError: true }
      ),
      queryClient.invalidateQueries(
        { predicate: invalidateLedgerStats(ledgerId) },
        { throwOnError: true }
      ),
      queryClient.invalidateQueries(
        {
          predicate: invalidateSourceDocumentStreamTotal(ledgerId),
        },
        { throwOnError: true }
      ),
      queryClient.invalidateQueries(
        { predicate: invalidateCalendar(ledgerId) },
        { throwOnError: true }
      ),
    ]);
  };

  const refreshDerivedQueries = (label: string) => {
    runBackgroundQueryRefresh({
      ledgerId,
      label,
      failureMessage: tCommon("savedRefreshFailed"),
      failureMode: "log-only",
      refresh: settleDerivedQueries,
    });
  };

  const batchUpdateDates = useMutation<
    BatchUpdateSourceDocumentsResultDto,
    Error,
    { ids: string[]; entryDate: string }
  >({
    mutationFn: ({ ids, entryDate }) =>
      batchUpdateSourceDocumentsAction(ledgerId, ids, { entryDate }),
    onSuccess: (result) => {
      notifyRefresh();
      toast.success(tBatch("datesUpdated", { count: result.updatedCount }));
      clearSelection();
      refreshDerivedQueries("batch source-document date refresh");
    },
    onError: () => {
      toast.error(tCommon("error"));
    },
  });

  const settleBatchResult = (
    result: BatchActionResult,
    successLabel: string,
    preserveIds: string[] = []
  ) => {
    notifyRefresh();
    const unresolved = [...result.skipped, ...result.failed].map((item) => item.id);
    const retained = [...new Set([...preserveIds, ...unresolved])];
    if (retained.length === 0) clearSelection();
    else retainSelection?.(retained);
    if (result.succeededIds.length > 0) toast.success(successLabel);
    if (unresolved.length > 0) {
      toast.warning(
        tBatch("partialResult", {
          succeeded: result.succeededIds.length,
          skipped: result.skipped.length,
          failed: result.failed.length,
        })
      );
    }
    refreshDerivedQueries("batch source-document action refresh");
  };

  const batchDelete = useMutation<BatchActionResult, Error, string[]>({
    mutationFn: (ids) => batchDeleteSourceDocumentsAction(ledgerId, ids),
    onSuccess: (result) =>
      settleBatchResult(result, tBatch("deleted", { count: result.succeededIds.length })),
    onError: () => toast.error(tCommon("deleteFailed")),
  });

  const batchRetry = useMutation<BatchActionResult, Error, string[]>({
    mutationFn: (ids) => batchRetrySourceDocumentsAction(ledgerId, ids),
    onSuccess: (result) =>
      settleBatchResult(result, tBatch("retried", { count: result.succeededIds.length })),
    onError: () => toast.error(tCommon("error")),
  });

  const batchKeepDuplicates = useMutation<BatchActionResult, Error, DuplicateBatchVariables>({
    mutationFn: (variables) =>
      batchResolveDuplicateReviewsAction(
        ledgerId,
        getDuplicateBatchVariables(variables).ids,
        "keep"
      ),
    onSuccess: (result, variables) =>
      settleBatchResult(
        result,
        tBatch("duplicatesKept", { count: result.succeededIds.length }),
        getDuplicateBatchVariables(variables).preserveIds
      ),
    onError: () => toast.error(tCommon("error")),
  });

  const batchDiscardDuplicates = useMutation<BatchActionResult, Error, DuplicateBatchVariables>({
    mutationFn: (variables) =>
      batchResolveDuplicateReviewsAction(
        ledgerId,
        getDuplicateBatchVariables(variables).ids,
        "discard"
      ),
    onSuccess: (result, variables) =>
      settleBatchResult(
        result,
        tBatch("duplicatesDiscarded", { count: result.succeededIds.length }),
        getDuplicateBatchVariables(variables).preserveIds
      ),
    onError: () => toast.error(tCommon("error")),
  });

  return {
    deleteSourceDocument,
    batchUpdateDates,
    batchDelete,
    batchRetry,
    batchKeepDuplicates,
    batchDiscardDuplicates,
  };
}
