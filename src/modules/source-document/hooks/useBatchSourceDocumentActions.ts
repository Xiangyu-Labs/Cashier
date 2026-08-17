"use client";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  deleteSourceDocumentAction,
  batchUpdateSourceDocumentsAction,
  batchDeleteSourceDocumentsAction,
  batchResolveDuplicateReviewsAction,
  batchRetrySourceDocumentsAction,
} from "@/modules/source-document/actions";
import type { BatchActionResult } from "@/lib/batch-ids";
import type { BatchUpdateSourceDocumentsResultDto } from "@/modules/source-document/contracts";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";

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
  const tCommon = useTranslations("Common");
  const tBatch = useTranslations("BatchActions");
  const deleteSourceDocument = useLedgerMutation<void, string>(ledgerId, {
    mutationFn: async (id: string) => {
      const operationId = crypto.randomUUID();
      await deleteSourceDocumentAction(ledgerId, id, operationId);
    },
    resourceGroups: ["documents"],
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    onSuccess: () => {
      clearSelection();
    },
  });

  const batchUpdateDates = useLedgerMutation<
    BatchUpdateSourceDocumentsResultDto,
    { ids: string[]; entryDate: string }
  >(ledgerId, {
    mutationFn: ({ ids, entryDate }) =>
      batchUpdateSourceDocumentsAction(ledgerId, ids, { entryDate }),
    resourceGroups: ["documents"],
    onSuccess: (result) => {
      toast.success(tBatch("datesUpdated", { count: result.updatedCount }));
      clearSelection();
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
  };

  const batchDelete = useLedgerMutation<BatchActionResult, string[]>(ledgerId, {
    mutationFn: (ids) => batchDeleteSourceDocumentsAction(ledgerId, ids),
    resourceGroups: ["documents"],
    onSuccess: (result) =>
      settleBatchResult(result, tBatch("deleted", { count: result.succeededIds.length })),
    onError: () => toast.error(tCommon("deleteFailed")),
  });

  const batchRetry = useLedgerMutation<BatchActionResult, string[]>(ledgerId, {
    mutationFn: (ids) => batchRetrySourceDocumentsAction(ledgerId, ids),
    resourceGroups: ["documents"],
    onSuccess: (result) =>
      settleBatchResult(result, tBatch("retried", { count: result.succeededIds.length })),
    onError: () => toast.error(tCommon("error")),
  });

  const batchKeepDuplicates = useLedgerMutation<BatchActionResult, DuplicateBatchVariables>(
    ledgerId,
    {
      mutationFn: (variables) =>
        batchResolveDuplicateReviewsAction(
          ledgerId,
          getDuplicateBatchVariables(variables).ids,
          "keep"
        ),
      resourceGroups: ["documents"],
      onSuccess: (result, variables) =>
        settleBatchResult(
          result,
          tBatch("duplicatesKept", { count: result.succeededIds.length }),
          getDuplicateBatchVariables(variables).preserveIds
        ),
      onError: () => toast.error(tCommon("error")),
    }
  );

  const batchDiscardDuplicates = useLedgerMutation<BatchActionResult, DuplicateBatchVariables>(
    ledgerId,
    {
      mutationFn: (variables) =>
        batchResolveDuplicateReviewsAction(
          ledgerId,
          getDuplicateBatchVariables(variables).ids,
          "discard"
        ),
      resourceGroups: ["documents"],
      onSuccess: (result, variables) =>
        settleBatchResult(
          result,
          tBatch("duplicatesDiscarded", { count: result.succeededIds.length }),
          getDuplicateBatchVariables(variables).preserveIds
        ),
      onError: () => toast.error(tCommon("error")),
    }
  );

  return {
    deleteSourceDocument,
    batchUpdateDates,
    batchDelete,
    batchRetry,
    batchKeepDuplicates,
    batchDiscardDuplicates,
  };
}
