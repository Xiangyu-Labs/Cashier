"use client";
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
import { getLedgerTransactionManager } from "@/lib/mutations/cache-transaction";
import type {
  SourceDocumentListItemDto,
  MutationReconciliation,
} from "@/modules/source-document/contracts";
import {
  applyOptimisticUpsert,
  applyOptimisticDelete,
  getStreamQueryMatches,
} from "./source-document-optimistic-cache";

/**
 * Capture the current entity from the stream cache for a given source document ID.
 */
function captureCurrentEntity(
  queryClient: ReturnType<typeof useQueryClient>,
  ledgerId: string,
  sourceDocumentId: string
): SourceDocumentListItemDto | null {
  const matches = getStreamQueryMatches(queryClient, ledgerId);
  for (const [, data] of matches) {
    if (!data) continue;
    for (const page of data.pages) {
      const found = page.items.find((item) => item.id === sourceDocumentId);
      if (found) return found;
    }
  }
  return null;
}

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
  // I4: Use module-level singleton to survive remounts
  const manager = ledgerId != null && ledgerId !== ""
    ? getLedgerTransactionManager(ledgerId)
    : null;
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
      if (ledgerId == null || manager == null) return;
      if (ledgerId == null) return;

      const op = manager.startOperation(ledgerId);

      // C3: Capture current entity from stream cache for rollback
      const prevEntity = captureCurrentEntity(queryClient, ledgerId, id);

      const optimisticEntity: Partial<SourceDocumentListItemDto> = {
        id,
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.entryDate !== undefined ? { entryDate: data.entryDate } : {}),
        updatedAt: new Date().toISOString(),
      };

      op.patches.push({
        type: "upsert",
        entityId: id,
        entity: optimisticEntity as SourceDocumentListItemDto,
        prevEntity, // C3: store actual previous entity
      });

      // Apply optimistic update to stream cache
      applyOptimisticUpsert(queryClient, ledgerId, optimisticEntity as SourceDocumentListItemDto);

      return { operationId };
    },
    onSuccess: (_data, variables) => {
      if (ledgerId == null) return;
      // I3: Pass real reconciliation entity — use the returned canonical entity
      const data = _data as Partial<{ reconciliation: MutationReconciliation<SourceDocumentListItemDto> }>;
      if (manager != null) {
        manager.commitOperation(
          variables.operationId,
          data.reconciliation?.entity ?? null,
          queryClient
        );
      }
    },
    onError: (_error, variables) => {
      if (ledgerId == null) return;
      if (manager != null) {
        manager.rollbackOperation(variables.operationId, queryClient);
      }
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
      if (ledgerId == null || manager == null) return;

      const op = manager.startOperation(ledgerId);

      // C3: Capture current entity from stream cache BEFORE optimistic delete
      const prevEntity = captureCurrentEntity(queryClient, ledgerId, id);

      op.patches.push({
        type: "delete",
        entityId: id,
        entity: prevEntity ?? {
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
        prevEntity, // C3: store actual previous entity for rollback
      });

      // Apply optimistic delete to stream cache
      applyOptimisticDelete(queryClient, ledgerId, id);

      return {};
    },
    onSuccess: () => {
      // Clean up the operation — delete doesn't need canonical entity
      toast.success(tCommon("deleteSuccess"));
      onClose();
    },
    onError: (_error, _variables) => {
      if (ledgerId == null) return;
      if (manager != null) {
        // Rollback to restore the entity
        for (const op of manager.getActiveOperations()) {
          for (const patch of op.patches) {
            if (patch.type === "delete" && patch.entityId === id) {
              applyOptimisticUpsert(queryClient, ledgerId, patch.entity);
              return;
            }
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
