"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deleteSourceDocumentAction,
  updateSourceDocumentAction,
} from "@/modules/source-document/actions";
import { invalidateSourceDocumentCounts } from "@/lib/query-keys";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
  sourceDocumentPredicates: _sourceDocumentPredicates,
  sourceDocumentSummaryPredicates: _sourceDocumentSummaryPredicates,
  sourceDocumentEntriesSummaryPredicates: _sourceDocumentEntriesSummaryPredicates,
}: UseSourceDocumentRecordMutationsOptions) {
  const queryClient = useQueryClient();
  const tCommon = useTranslations("Common");
  const notifyRefresh = useNotifyRevisionRefresh();

  // -----------------------------------------------------------------------
  // Update source document (title, entryDate)
  // -----------------------------------------------------------------------

  const updateSourceDocMutation = useMutation({
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
    onSuccess: async (result) => {
      if (ledgerId == null) return;
      applySourceDocumentReconciliation(
        queryClient,
        ledgerId,
        id,
        (
          result as
            | { reconciliation?: MutationReconciliation<SourceDocumentListItemDto> }
            | null
            | undefined
        )?.reconciliation
      );
      notifyRefresh();
    },
    onSettled: () => {
      if (ledgerId != null && ledgerId !== "") {
        queryClient.invalidateQueries({
          predicate: invalidateSourceDocumentCounts(ledgerId),
        });
      }
    },
  });

  // -----------------------------------------------------------------------
  // Delete source document
  // -----------------------------------------------------------------------

  const deleteDocumentMutation = useMutation({
    mutationFn: async ({ operationId }: { operationId: string }) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      return deleteSourceDocumentAction(ledgerId, id, operationId);
    },
    onSuccess: async (result) => {
      if (ledgerId != null) {
        applySourceDocumentReconciliation(
          queryClient,
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
      toast.success(tCommon("deleteSuccess"));
      onClose();
    },
    onError: () => {
      toast.error(tCommon("deleteFailed"));
    },
    onSettled: () => {
      if (ledgerId != null && ledgerId !== "") {
        queryClient.invalidateQueries({
          predicate: invalidateSourceDocumentCounts(ledgerId),
        });
      }
    },
  });

  return {
    updateSourceDocMutation,
    deleteDocumentMutation,
  };
}
