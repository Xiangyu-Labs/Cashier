"use client";

import { useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocumentCounts,
  invalidateSourceDocuments,
} from "@/lib/query-keys";
import {
  acceptSourceDocumentCandidateAction,
  abandonSourceDocumentCandidateAction,
  cancelSourceDocumentProcessingAction,
  retrySourceDocumentAction,
} from "@/modules/source-document/actions";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useNotifyRevisionRefresh } from "./revision-state-refresh";
import { applySourceDocumentReconciliation } from "./source-document-optimistic-cache";
import type {
  MutationReconciliation,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";

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
 * Cached server data remains unchanged until an action succeeds.
 */
export function useSourceDocumentRecoveryMutations({
  ledgerId,
  sourceDocumentId,
  revisionId,
  onSuccess,
}: UseSourceDocumentRecoveryMutationsOptions) {
  const queryClient = useQueryClient();
  const notifyRefresh = useNotifyRevisionRefresh();
  const actionLockRef = useRef(false);
  const tActions = useTranslations("CandidateAction");
  const tCommon = useTranslations("Common");

  const refreshCandidateResult = useCallback(async () => {
    notifyRefresh();
    try {
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
          { predicate: invalidateCalendar(ledgerId) },
          { throwOnError: true }
        ),
        queryClient.invalidateQueries(
          { predicate: invalidateSourceDocumentCounts(ledgerId) },
          { throwOnError: true }
        ),
      ]);
    } catch (error) {
      console.error("Failed to refresh candidate result after successful write", error);
      toast.warning(tCommon("savedRefreshFailed"));
    }
  }, [ledgerId, notifyRefresh, queryClient, tCommon]);

  // -----------------------------------------------------------------------
  // Accept candidate
  // -----------------------------------------------------------------------

  const acceptMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      if (revisionId == null) throw new Error("No revision ID provided for accept");
      return acceptSourceDocumentCandidateAction(ledgerId, sourceDocumentId, revisionId, undefined);
    },
    onSuccess: async () => {
      // The accept reconciliation entity is intentionally minimal and would
      // blank the card's entries; the delta refresh overlays authoritative
      // data, so accept relies on the incremental refresh path.
      await refreshCandidateResult();
      toast.success(tActions("acceptSuccess"));
      onSuccess?.();
    },
    onError: () => {
      toast.error(tActions("acceptError"));
    },
  });

  // -----------------------------------------------------------------------
  // Abandon candidate
  // -----------------------------------------------------------------------

  const abandonMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      if (revisionId == null) throw new Error("No revision ID provided for abandon");
      return abandonSourceDocumentCandidateAction(
        ledgerId,
        sourceDocumentId,
        revisionId,
        undefined
      );
    },
    onSuccess: async () => {
      // Same as accept: rely on the incremental refresh instead of applying
      // the minimal placeholder entity. Wake the refresh coordinator so the
      // delta refresh overlays the authoritative state even when polling has
      // reached a terminal state.
      await refreshCandidateResult();
      toast.success(tActions("abandonSuccess"));
      onSuccess?.();
    },
    onError: () => {
      toast.error(tActions("abandonError"));
    },
  });

  // -----------------------------------------------------------------------
  // Direct retry
  // -----------------------------------------------------------------------

  const retryMutation = useMutation<unknown, Error, { operationId: string }>({
    mutationFn: async ({ operationId }) => {
      return retrySourceDocumentAction(ledgerId, sourceDocumentId, operationId);
    },
    onSuccess: async (result) => {
      applySourceDocumentReconciliation(
        queryClient,
        ledgerId,
        sourceDocumentId,
        (
          result as
            | { reconciliation?: MutationReconciliation<SourceDocumentListItemDto> }
            | null
            | undefined
        )?.reconciliation
      );
      notifyRefresh();
      toast.success(tActions("retrySuccess"), {
        description: tActions("retrySuccessDescription"),
      });
      onSuccess?.();
    },
    onError: () => {
      toast.error(tActions("retryError"), {
        description: tActions("retryErrorDescription"),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentCounts(ledgerId),
      });
    },
  });

  const cancelMutation = useMutation<unknown, Error, { operationId: string }>({
    mutationFn: async ({ operationId }) => {
      if (revisionId == null) throw new Error("No revision ID provided for cancellation");
      return cancelSourceDocumentProcessingAction(
        ledgerId,
        sourceDocumentId,
        revisionId,
        operationId
      );
    },
    onSuccess: async (result) => {
      applySourceDocumentReconciliation(
        queryClient,
        ledgerId,
        sourceDocumentId,
        (
          result as
            | { reconciliation?: MutationReconciliation<SourceDocumentListItemDto> }
            | null
            | undefined
        )?.reconciliation
      );
      notifyRefresh();
      toast.success(tActions("cancelSuccess"));
      onSuccess?.();
    },
    onError: () => toast.error(tActions("cancelError")),
    onSettled: () => {
      queryClient.invalidateQueries({ predicate: invalidateSourceDocumentCounts(ledgerId) });
    },
  });

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  const acceptCandidate = useCallback(async () => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    try {
      await acceptMutation.mutateAsync();
    } finally {
      actionLockRef.current = false;
    }
  }, [acceptMutation]);

  const abandonCandidate = useCallback(async () => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    try {
      await abandonMutation.mutateAsync();
    } finally {
      actionLockRef.current = false;
    }
  }, [abandonMutation]);

  const retry = useCallback(async () => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    try {
      await retryMutation.mutateAsync({ operationId: crypto.randomUUID() });
    } finally {
      actionLockRef.current = false;
    }
  }, [retryMutation]);

  const cancelProcessing = useCallback(async () => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    try {
      await cancelMutation.mutateAsync({ operationId: crypto.randomUUID() });
    } finally {
      actionLockRef.current = false;
    }
  }, [cancelMutation]);

  return {
    acceptCandidate,
    abandonCandidate,
    retry,
    cancelProcessing,
    isAccepting: acceptMutation.isPending,
    isAbandoning: abandonMutation.isPending,
    isRetrying: retryMutation.isPending,
    isCancelling: cancelMutation.isPending,
    isReviewing: acceptMutation.isPending || abandonMutation.isPending,
  };
}
