"use client";

import { useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateSourceDocumentCounts } from "@/lib/query-keys";
import { CacheTransactionManager } from "@/lib/mutations/cache-transaction";
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
} from "./source-document-optimistic-cache";
import { notifyNewSubmission } from "./revision-state-refresh";

interface UseSourceDocumentRecoveryMutationsOptions {
  ledgerId: string;
  sourceDocumentId: string;
  revisionId?: string;
  onSuccess?: () => void;
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
  const transactionRef = useRef<CacheTransactionManager>(new CacheTransactionManager());
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
      const op = transactionRef.current.startOperation(ledgerId);
      const now = new Date().toISOString();

      const optimisticEntity: SourceDocumentListItemDto = {
        id: sourceDocumentId,
        ledgerId,
        title: null,
        text: null,
        files: [],
        status: "completed",
        type: "ai_parsed",
        anomalyReason: null,
        entryDate: null,
        metadata: {},
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        hasImages: false,
        supportedActions: [],
        errorCode: null,
        pendingRevisionId: null,
        ledgerEntries: [],
      };

      op.patches.push({
        type: "upsert",
        entityId: sourceDocumentId,
        entity: optimisticEntity,
        prevEntity: null,
      });

      applyOptimisticUpsert(queryClient, ledgerId, optimisticEntity);
      notifyNewSubmission();
      return { operationId: op.operationId };
    },
    onSuccess: (_data, variables) => {
      transactionRef.current.commitOperation(variables.operationId, null, queryClient);
      toast.success(tActions("acceptSuccess"));
      onSuccess?.();
    },
    onError: (_error, variables) => {
      transactionRef.current.rollbackOperation(variables.operationId, queryClient);
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
      const op = transactionRef.current.startOperation(ledgerId);
      const now = new Date().toISOString();

      const optimisticEntity: SourceDocumentListItemDto = {
        id: sourceDocumentId,
        ledgerId,
        title: null,
        text: null,
        files: [],
        status: "completed",
        type: "ai_parsed",
        anomalyReason: null,
        entryDate: null,
        metadata: {},
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        hasImages: false,
        supportedActions: [],
        errorCode: null,
        pendingRevisionId: null,
        ledgerEntries: [],
      };

      op.patches.push({
        type: "upsert",
        entityId: sourceDocumentId,
        entity: optimisticEntity,
        prevEntity: null,
      });

      applyOptimisticUpsert(queryClient, ledgerId, optimisticEntity);
      return { operationId: op.operationId };
    },
    onSuccess: (_data, variables) => {
      transactionRef.current.commitOperation(variables.operationId, null, queryClient);
      toast.success(tActions("abandonSuccess"));
      onSuccess?.();
    },
    onError: (_error, variables) => {
      transactionRef.current.rollbackOperation(variables.operationId, queryClient);
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
      const op = transactionRef.current.startOperation(ledgerId);
      const now = new Date().toISOString();

      const optimisticEntity: SourceDocumentListItemDto = {
        id: sourceDocumentId,
        ledgerId,
        title: null,
        text: null,
        files: [],
        status: "queued",
        type: "ai_parsed",
        anomalyReason: null,
        entryDate: null,
        metadata: {},
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        hasImages: false,
        supportedActions: [],
        errorCode: null,
        pendingRevisionId: null,
        ledgerEntries: [],
      };

      op.patches.push({
        type: "upsert",
        entityId: sourceDocumentId,
        entity: optimisticEntity,
        prevEntity: null,
      });

      applyOptimisticUpsert(queryClient, ledgerId, optimisticEntity);
      notifyNewSubmission();
      return { operationId: op.operationId };
    },
    onSuccess: (_data, variables) => {
      transactionRef.current.commitOperation(variables.operationId, null, queryClient);
      onSuccess?.();
    },
    onError: (_error, variables) => {
      transactionRef.current.rollbackOperation(variables.operationId, queryClient);
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
    const op = transactionRef.current.startOperation(ledgerId);
    await acceptMutation.mutateAsync({ operationId: op.operationId });
  }, [ledgerId, acceptMutation]);

  const abandonCandidate = useCallback(async () => {
    const op = transactionRef.current.startOperation(ledgerId);
    await abandonMutation.mutateAsync({ operationId: op.operationId });
  }, [ledgerId, abandonMutation]);

  const retry = useCallback(async () => {
    const op = transactionRef.current.startOperation(ledgerId);
    await retryMutation.mutateAsync({ operationId: op.operationId });
  }, [ledgerId, retryMutation]);

  return {
    acceptCandidate,
    abandonCandidate,
    retry,
    isAccepting: acceptMutation.isPending,
    isAbandoning: abandonMutation.isPending,
    isRetrying: retryMutation.isPending,
  };
}
