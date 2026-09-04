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
import type {
  PartialBatchCommandResult,
  BatchUpdateSourceDocumentsResultDto,
  VersionedTarget,
} from "@/modules/source-document/contracts";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  requireSourceDocumentVersion,
  SourceDocumentStaleCommandError,
  unwrapAtomicBatchCommandResult,
  unwrapVersionedCommandResult,
} from "@/modules/source-document/command-results";

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
  retainSelection: ((ids: string[]) => void) | undefined,
  versions: ReadonlyMap<string, number>
) {
  const tCommon = useTranslations("Common");
  const tBatch = useTranslations("BatchActions");
  const versionFor = (sourceDocumentId: string) =>
    requireSourceDocumentVersion(versions.get(sourceDocumentId), sourceDocumentId);
  const deleteSourceDocument = useLedgerMutation<void, string>(ledgerId, {
    mutationFn: async (id: string) => {
      const result = await deleteSourceDocumentAction(ledgerId, id, versionFor(id));
      unwrapVersionedCommandResult(result);
    },
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
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
    mutationFn: async ({ ids, entryDate }) => {
      const result = await batchUpdateSourceDocumentsAction(ledgerId, {
        targets: ids.map((sourceDocumentId) => ({
          sourceDocumentId,
          expectedVersion: versionFor(sourceDocumentId),
        })),
        data: { entryDate },
      });
      return unwrapAtomicBatchCommandResult(result);
    },
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    onSuccess: (result) => {
      toast.success(tBatch("datesUpdated", { count: result.updatedCount }));
      clearSelection();
    },
    onError: (error) => {
      toast.error(
        error instanceof SourceDocumentStaleCommandError
          ? tBatch("selectionChanged")
          : tCommon("error")
      );
    },
  });

  const settleBatchResult = (
    result: PartialBatchCommandResult,
    successLabel: string,
    preserveIds: string[] = []
  ) => {
    const unresolved = [...result.stale, ...result.failed].map((item) => item.id);
    const retained = [...new Set([...preserveIds, ...unresolved])];
    if (retained.length === 0) clearSelection();
    else retainSelection?.(retained);
    if (result.succeeded.length > 0) toast.success(successLabel);
    if (unresolved.length > 0) {
      toast.warning(
        tBatch("partialResult", {
          succeeded: result.succeeded.length,
          skipped: result.stale.length,
          failed: result.failed.length,
        })
      );
    }
  };

  const targetsFor = (ids: string[]): VersionedTarget[] =>
    ids.map((sourceDocumentId) => ({
      sourceDocumentId,
      expectedVersion: versionFor(sourceDocumentId),
    }));

  const batchDelete = useLedgerMutation<PartialBatchCommandResult, string[]>(ledgerId, {
    mutationFn: (ids) => batchDeleteSourceDocumentsAction(ledgerId, targetsFor(ids)),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    onSuccess: (result) =>
      settleBatchResult(result, tBatch("deleted", { count: result.succeeded.length })),
    onError: () => toast.error(tCommon("deleteFailed")),
  });

  const batchRetry = useLedgerMutation<PartialBatchCommandResult, string[]>(ledgerId, {
    mutationFn: (ids) => batchRetrySourceDocumentsAction(ledgerId, targetsFor(ids)),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    onSuccess: (result) =>
      settleBatchResult(result, tBatch("retried", { count: result.succeeded.length })),
    onError: () => toast.error(tCommon("error")),
  });

  const batchKeepDuplicates = useLedgerMutation<PartialBatchCommandResult, DuplicateBatchVariables>(
    ledgerId,
    {
      mutationFn: (variables) =>
        batchResolveDuplicateReviewsAction(
          ledgerId,
          targetsFor(getDuplicateBatchVariables(variables).ids),
          "keep"
        ),
      invalidationErrorMessage: tCommon("savedRefreshFailed"),
      onSuccess: (result, variables) =>
        settleBatchResult(
          result,
          tBatch("duplicatesKept", { count: result.succeeded.length }),
          getDuplicateBatchVariables(variables).preserveIds
        ),
      onError: () => toast.error(tCommon("error")),
    }
  );

  const batchDiscardDuplicates = useLedgerMutation<
    PartialBatchCommandResult,
    DuplicateBatchVariables
  >(ledgerId, {
    mutationFn: (variables) =>
      batchResolveDuplicateReviewsAction(
        ledgerId,
        targetsFor(getDuplicateBatchVariables(variables).ids),
        "discard"
      ),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    onSuccess: (result, variables) =>
      settleBatchResult(
        result,
        tBatch("duplicatesDiscarded", { count: result.succeeded.length }),
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
