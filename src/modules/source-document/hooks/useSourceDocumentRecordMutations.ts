"use client";
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deleteSourceDocumentAction,
  updateSourceDocumentAction,
} from "@/modules/source-document/actions";
import {
  invalidateSourceDocumentCounts,
} from "@/lib/query-keys";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CacheTransactionManager } from "@/lib/mutations/cache-transaction";
import type {
  SourceDocumentListItemDto,
  MutationReconciliation,
} from "@/modules/source-document/contracts";
import {
  applyOptimisticUpsert,
  applyOptimisticDelete,
} from "./source-document-optimistic-cache";

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
  const transactionRef = useRef<CacheTransactionManager>(new CacheTransactionManager());
  const tCommon = useTranslations("Common");

  // -----------------------------------------------------------------------
  // Update source document (title, entryDate)
  // -----------------------------------------------------------------------

  const updateSourceDocMutation = useMutation({
    mutationFn: async ({ data, operationId }: { data: { title?: string; entryDate?: string }; operationId: string }) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      return updateSourceDocumentAction(ledgerId, id, data, operationId);
    },
    onMutate: ({ data, operationId }) => {
      if (ledgerId == null) return;

      const op = transactionRef.current.startOperation(ledgerId);
      const now = new Date().toISOString();

      const optimisticEntity: Partial<SourceDocumentListItemDto> = {
        id,
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.entryDate !== undefined ? { entryDate: data.entryDate } : {}),
        updatedAt: now,
      };

      op.patches.push({
        type: "upsert",
        entityId: id,
        entity: optimisticEntity as SourceDocumentListItemDto,
        prevEntity: null,
      });

      // Apply optimistic update to stream cache
      applyOptimisticUpsert(queryClient, ledgerId, optimisticEntity as SourceDocumentListItemDto);

      return { operationId };
    },
    onSuccess: (_data, variables) => {
      if (ledgerId == null) return;
      transactionRef.current.commitOperation(variables.operationId, null, queryClient);
    },
    onError: (_error, variables) => {
      if (ledgerId == null) return;
      transactionRef.current.rollbackOperation(variables.operationId, queryClient);
      toast.error(tCommon("saveFailed"));
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
    onMutate: () => {
      if (ledgerId == null) return;

      const op = transactionRef.current.startOperation(ledgerId);

      op.patches.push({
        type: "delete",
        entityId: id,
        entity: {
          id,
          ledgerId,
          title: null,
          text: null,
          files: [],
          status: "completed",
          type: "ai_parsed",
          anomalyReason: null,
          entryDate: null,
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          hasImages: false,
          supportedActions: [],
          errorCode: null,
          pendingRevisionId: null,
          ledgerEntries: [],
        } as SourceDocumentListItemDto,
        prevEntity: null,
      });

      // Apply optimistic delete to stream cache
      applyOptimisticDelete(queryClient, ledgerId, id);

      return {};
    },
    onSuccess: () => {
      toast.success(tCommon("deleteSuccess"));
      onClose();
    },
    onError: (_error, _variables) => {
      if (ledgerId == null) return;
      // Rollback to restore the entity
      // We need the original entity data for rollback — find it in stream cache
      for (const op of transactionRef.current.getActiveOperations()) {
        for (const patch of op.patches) {
          if (patch.type === "delete" && patch.entityId === id) {
            applyOptimisticUpsert(queryClient, ledgerId, patch.entity);
            return;
          }
        }
      }
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
