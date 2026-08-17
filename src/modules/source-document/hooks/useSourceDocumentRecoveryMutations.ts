"use client";

import { useCallback, useRef } from "react";
import {
  acceptSourceDocumentCandidateAction,
  abandonSourceDocumentCandidateAction,
  cancelSourceDocumentProcessingAction,
  retrySourceDocumentAction,
} from "@/modules/source-document/actions";
import { useTranslations } from "next-intl";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";

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
  const actionLockRef = useRef(false);
  const tActions = useTranslations("CandidateAction");

  // -----------------------------------------------------------------------
  // Accept candidate
  // -----------------------------------------------------------------------

  const acceptMutation = useLedgerMutation<unknown, void>(ledgerId, {
    mutationFn: async () => {
      if (revisionId == null) throw new Error("No revision ID provided for accept");
      return acceptSourceDocumentCandidateAction(ledgerId, sourceDocumentId, revisionId, undefined);
    },
    resourceGroups: ["documents"],
    successMessage: tActions("acceptSuccess"),
    errorMessage: tActions("acceptError"),
    onSuccess: () => {
      onSuccess?.();
    },
  });

  // -----------------------------------------------------------------------
  // Abandon candidate
  // -----------------------------------------------------------------------

  const abandonMutation = useLedgerMutation<unknown, void>(ledgerId, {
    mutationFn: async () => {
      if (revisionId == null) throw new Error("No revision ID provided for abandon");
      return abandonSourceDocumentCandidateAction(
        ledgerId,
        sourceDocumentId,
        revisionId,
        undefined
      );
    },
    resourceGroups: ["documents"],
    successMessage: tActions("abandonSuccess"),
    errorMessage: tActions("abandonError"),
    onSuccess: () => {
      onSuccess?.();
    },
  });

  // -----------------------------------------------------------------------
  // Direct retry
  // -----------------------------------------------------------------------

  const retryMutation = useLedgerMutation<unknown, { operationId: string }>(ledgerId, {
    mutationFn: async ({ operationId }) => {
      return retrySourceDocumentAction(ledgerId, sourceDocumentId, operationId);
    },
    resourceGroups: ["documents"],
    successMessage: tActions("retrySuccess"),
    errorMessage: tActions("retryError"),
    onSuccess: () => {
      onSuccess?.();
    },
  });

  const cancelMutation = useLedgerMutation<unknown, { operationId: string }>(ledgerId, {
    mutationFn: async ({ operationId }) => {
      if (revisionId == null) throw new Error("No revision ID provided for cancellation");
      return cancelSourceDocumentProcessingAction(
        ledgerId,
        sourceDocumentId,
        revisionId,
        operationId
      );
    },
    resourceGroups: ["documents"],
    successMessage: tActions("cancelSuccess"),
    errorMessage: tActions("cancelError"),
    onSuccess: () => {
      onSuccess?.();
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
