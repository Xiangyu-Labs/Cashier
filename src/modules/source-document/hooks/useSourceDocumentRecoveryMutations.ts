"use client";

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateSourceDocumentCounts } from "@/lib/query-keys";
import { getLedgerTransactionManager } from "@/lib/mutations/cache-transaction";
import {
  acceptSourceDocumentCandidateAction,
  abandonSourceDocumentCandidateAction,
  retrySourceDocumentAction,
} from "@/modules/source-document/actions";
import type {
  SourceDocumentListItemDto,
  MutationReconciliation,
} from "@/modules/source-document/contracts";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  applyOptimisticUpsert,
  applyOptimisticDelete,
  getStreamQueryMatches,
} from "./source-document-optimistic-cache";
import { notifyNewSubmission } from "./revision-state-refresh";

interface UseSourceDocumentRecoveryMutationsOptions {
  ledgerId: string;
  sourceDocumentId: string;
  revisionId?: string;
  onSuccess?: () => void;
}

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

/**
 * Provides mutations for source document recovery actions:
 * - Accept candidate
 * - Abandon candidate
 * - Direct retry
 *
 * Uses operation-scoped cache transactions for optimistic updates.
 */
export function useSourceDocumentRecoveryMutations({
  ledgerId,
  sourceDocumentId,
  revisionId,
  onSuccess,
}: UseSourceDocumentRecoveryMutationsOptions) {
  const queryClient = useQueryClient();
  // I4: Use module-level singleton to survive remounts
  const manager = getLedgerTransactionManager(ledgerId);
  const tActions = useTranslations("CandidateAction");

  // -----------------------------------------------------------------------
  // Accept candidate
  // -----------------------------------------------------------------------

  const acceptMutation = useMutation<unknown, Error, { operationId: string }>({
    mutationFn: async () => {
      if (revisionId == null) throw new Error("No revision ID provided for accept");
      return acceptSourceDocumentCandidateAction(
        ledgerId,
        sourceDocumentId,
        revisionId,
        "accept-" + crypto.randomUUID()
      );
    },
    onMutate: () => {
      const op = manager.startOperation(ledgerId);

      // C3: Capture current entity from stream cache for rollback
      const prevEntity = captureCurrentEntity(queryClient, ledgerId, sourceDocumentId);

      const optimisticEntity: SourceDocumentListItemDto = {
        id: sourceDocumentId,
        ledgerId,
        title: prevEntity?.title ?? null,
        text: null,
        files: [],
        status: "completed",
        type: "ai_parsed",
        anomalyReason: null,
        entryDate: prevEntity?.entryDate ?? null,
        metadata: {},
        createdAt: prevEntity?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        hasImages: prevEntity?.hasImages ?? false,
        supportedActions: [],
        errorCode: null,
        pendingRevisionId: null,
        ledgerEntries: prevEntity?.ledgerEntries ?? [],
      };

      op.patches.push({
        type: "upsert",
        entityId: sourceDocumentId,
        entity: optimisticEntity,
        prevEntity, // C3: store actual previous entity
      });

      applyOptimisticUpsert(queryClient, ledgerId, optimisticEntity);
      notifyNewSubmission();
      return { operationId: op.operationId };
    },
    onSuccess: (_data, variables) => {
      // I3: Pass reconciliation — we don't have the canonical entity here,
      // but the commit clears the operation from the pending stack
      manager.commitOperation(variables.operationId, null, queryClient);
      toast.success(tActions("acceptSuccess"));
      onSuccess?.();
    },
    onError: (_error, variables) => {
      manager.rollbackOperation(variables.operationId, queryClient);
      toast.error(tActions("acceptError"));
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentCounts(ledgerId),
      });
    },
  });

  // -----------------------------------------------------------------------
  // Abandon candidate
  // -----------------------------------------------------------------------

  const abandonMutation = useMutation<unknown, Error, { operationId: string }>({
    mutationFn: async () => {
      if (revisionId == null) throw new Error("No revision ID provided for abandon");
      return abandonSourceDocumentCandidateAction(
        ledgerId,
        sourceDocumentId,
        revisionId,
        "abandon-" + crypto.randomUUID()
      );
    },
    onMutate: () => {
      const op = manager.startOperation(ledgerId);

      // C3: Capture current entity from stream cache for rollback
      const prevEntity = captureCurrentEntity(queryClient, ledgerId, sourceDocumentId);

      const optimisticEntity: SourceDocumentListItemDto = {
        id: sourceDocumentId,
        ledgerId,
        title: prevEntity?.title ?? null,
        text: null,
        files: [],
        status: "completed",
        type: "ai_parsed",
        anomalyReason: null,
        entryDate: prevEntity?.entryDate ?? null,
        metadata: {},
        createdAt: prevEntity?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        hasImages: prevEntity?.hasImages ?? false,
        supportedActions: [],
        errorCode: null,
        pendingRevisionId: null,
        ledgerEntries: prevEntity?.ledgerEntries ?? [],
      };

      op.patches.push({
        type: "upsert",
        entityId: sourceDocumentId,
        entity: optimisticEntity,
        prevEntity, // C3: store actual previous entity
      });

      applyOptimisticUpsert(queryClient, ledgerId, optimisticEntity);
      return { operationId: op.operationId };
    },
    onSuccess: (_data, variables) => {
      manager.commitOperation(variables.operationId, null, queryClient);
      toast.success(tActions("abandonSuccess"));
      onSuccess?.();
    },
    onError: (_error, variables) => {
      manager.rollbackOperation(variables.operationId, queryClient);
      toast.error(tActions("abandonError"));
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentCounts(ledgerId),
      });
    },
  });

  // -----------------------------------------------------------------------
  // Direct retry
  // -----------------------------------------------------------------------

  const retryMutation = useMutation<unknown, Error, { operationId: string }>({
    mutationFn: async () => {
      return retrySourceDocumentAction(ledgerId, sourceDocumentId, "retry-" + crypto.randomUUID());
    },
    onMutate: () => {
      const op = manager.startOperation(ledgerId);

      // C3: Capture current entity from stream cache for rollback
      const prevEntity = captureCurrentEntity(queryClient, ledgerId, sourceDocumentId);

      const optimisticEntity: SourceDocumentListItemDto = {
        id: sourceDocumentId,
        ledgerId,
        title: prevEntity?.title ?? null,
        text: null,
        files: [],
        status: "queued",
        type: "ai_parsed",
        anomalyReason: null,
        entryDate: prevEntity?.entryDate ?? null,
        metadata: {},
        createdAt: prevEntity?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        hasImages: prevEntity?.hasImages ?? false,
        supportedActions: [],
        errorCode: null,
        pendingRevisionId: null,
        ledgerEntries: prevEntity?.ledgerEntries ?? [],
      };

      op.patches.push({
        type: "upsert",
        entityId: sourceDocumentId,
        entity: optimisticEntity,
        prevEntity, // C3: store actual previous entity
      });

      applyOptimisticUpsert(queryClient, ledgerId, optimisticEntity);
      notifyNewSubmission();
      return { operationId: op.operationId };
    },
    onSuccess: (_data, variables) => {
      manager.commitOperation(variables.operationId, null, queryClient);
      onSuccess?.();
    },
    onError: (_error, variables) => {
      manager.rollbackOperation(variables.operationId, queryClient);
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentCounts(ledgerId),
      });
    },
  });

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  const acceptCandidate = useCallback(async () => {
    const op = manager.startOperation(ledgerId);
    await acceptMutation.mutateAsync({ operationId: op.operationId });
  }, [ledgerId, acceptMutation, manager]);

  const abandonCandidate = useCallback(async () => {
    const op = manager.startOperation(ledgerId);
    await abandonMutation.mutateAsync({ operationId: op.operationId });
  }, [ledgerId, abandonMutation, manager]);

  const retry = useCallback(async () => {
    const op = manager.startOperation(ledgerId);
    await retryMutation.mutateAsync({ operationId: op.operationId });
  }, [ledgerId, retryMutation, manager]);

  return {
    acceptCandidate,
    abandonCandidate,
    retry,
    isAccepting: acceptMutation.isPending,
    isAbandoning: abandonMutation.isPending,
    isRetrying: retryMutation.isPending,
  };
}
