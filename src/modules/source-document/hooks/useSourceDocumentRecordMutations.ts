"use client";
import {
  deleteSourceDocumentAction,
  updateSourceDocumentAction,
} from "@/modules/source-document/actions";
import { invalidateSourceDocumentCounts } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { useTranslations } from "next-intl";
import { applySourceDocumentReconciliation } from "./source-document-optimistic-cache";
import { useNotifyRevisionRefresh } from "./revision-state-refresh";
import type {
  MutationReconciliation,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";

type QueryPredicate = (query: { queryKey: readonly unknown[] }) => boolean;

interface UseSourceDocumentRecordMutationsOptions {
  id: string;
  ledgerId: string | undefined;
  onClose: () => void;
  sourceDocumentPredicates: QueryPredicate[] | null;
  sourceDocumentSummaryPredicates: QueryPredicate[] | null;
  sourceDocumentEntriesSummaryPredicates: QueryPredicate[] | null;
}

export function useSourceDocumentRecordMutations({
  id,
  ledgerId,
  onClose,
  sourceDocumentPredicates,
  sourceDocumentSummaryPredicates,
  sourceDocumentEntriesSummaryPredicates,
}: UseSourceDocumentRecordMutationsOptions) {
  const tCommon = useTranslations("Common");
  const notifyRefresh = useNotifyRevisionRefresh();

  // -----------------------------------------------------------------------
  // Update source document (title, entryDate)
  // -----------------------------------------------------------------------

  const cancelPredicates = sourceDocumentPredicates ?? [];
  const invalidatePredicates = [
    ...(sourceDocumentPredicates ?? []),
    ...(sourceDocumentSummaryPredicates ?? []),
    ...(sourceDocumentEntriesSummaryPredicates ?? []),
    ...(ledgerId == null || ledgerId === "" ? [] : [invalidateSourceDocumentCounts(ledgerId)]),
  ];

  const updateSourceDocMutation = useLedgerMutation(ledgerId, {
    mutationFn: async ({
      data,
      operationId,
    }: {
      data: { title?: string; entryDate?: string };
      operationId: string;
    }) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      return updateSourceDocumentAction(ledgerId, id, data, operationId);
    },
    successMessage: null,
    errorMessage: null,
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    refreshFailureMode: "log-only",
    cancelPredicates,
    invalidatePredicates,
    onSuccessReconcile: (client, result) => {
      if (ledgerId == null) return;
      applySourceDocumentReconciliation(
        client,
        ledgerId,
        id,
        (
          result as
            | { reconciliation?: MutationReconciliation<SourceDocumentListItemDto> }
            | null
            | undefined
        )?.reconciliation
      );
    },
    onWriteSuccess: notifyRefresh,
  });

  // -----------------------------------------------------------------------
  // Delete source document
  // -----------------------------------------------------------------------

  const deleteDocumentMutation = useLedgerMutation(ledgerId, {
    mutationFn: async ({ operationId }: { operationId: string }) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      return deleteSourceDocumentAction(ledgerId, id, operationId);
    },
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    refreshFailureMode: "log-only",
    cancelPredicates,
    invalidatePredicates,
    onSuccessReconcile: (client, result) => {
      if (ledgerId != null) {
        applySourceDocumentReconciliation(
          client,
          ledgerId,
          id,
          (
            result as
              | { reconciliation?: MutationReconciliation<SourceDocumentListItemDto> }
              | null
              | undefined
          )?.reconciliation
        );
      }
    },
    onWriteSuccess: () => {
      onClose();
    },
  });

  return {
    updateSourceDocMutation,
    deleteDocumentMutation,
  };
}
