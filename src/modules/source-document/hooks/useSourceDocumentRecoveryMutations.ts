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
import { useSourceDocumentRevisionDecisionMutation } from "./useSourceDocumentRevisionDecisionMutation";
import {
  requireSourceDocumentVersion,
  unwrapVersionedCommandResult,
} from "@/modules/source-document/command-results";

interface UseSourceDocumentRecoveryMutationsOptions {
  ledgerId: string;
  sourceDocumentId: string;
  /** Read fresh at submission time — never captured ahead of the actual click. */
  version: number | null;
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
  version,
  onSuccess,
}: UseSourceDocumentRecoveryMutationsOptions) {
  const actionLockRef = useRef(false);
  const tActions = useTranslations("CandidateAction");
  const tCommon = useTranslations("Common");

  // -----------------------------------------------------------------------
  // Accept candidate
  // -----------------------------------------------------------------------

  const acceptMutation = useSourceDocumentRevisionDecisionMutation({
    ledgerId,
    sourceDocumentId,
    expectedVersion: version,
    action: acceptSourceDocumentCandidateAction,
    successMessage: tActions("acceptSuccess"),
    errorMessage: tActions("acceptError"),
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });

  // -----------------------------------------------------------------------
  // Abandon candidate
  // -----------------------------------------------------------------------

  const abandonMutation = useSourceDocumentRevisionDecisionMutation({
    ledgerId,
    sourceDocumentId,
    expectedVersion: version,
    action: abandonSourceDocumentCandidateAction,
    successMessage: tActions("abandonSuccess"),
    errorMessage: tActions("abandonError"),
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });

  // -----------------------------------------------------------------------
  // Direct retry
  // -----------------------------------------------------------------------

  const retryMutation = useLedgerMutation<unknown, void>(ledgerId, {
    mutationFn: async () => {
      const expectedVersion = requireSourceDocumentVersion(version, sourceDocumentId);
      const result = await retrySourceDocumentAction(ledgerId, sourceDocumentId, expectedVersion);
      return unwrapVersionedCommandResult(result);
    },
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    successMessage: tActions("retrySuccess"),
    errorMessage: tActions("retryError"),
    onSuccess: () => {
      onSuccess?.();
    },
  });

  const cancelMutation = useLedgerMutation<unknown, void>(ledgerId, {
    mutationFn: async () => {
      const expectedVersion = requireSourceDocumentVersion(version, sourceDocumentId);
      const result = await cancelSourceDocumentProcessingAction(
        ledgerId,
        sourceDocumentId,
        expectedVersion
      );
      return unwrapVersionedCommandResult(result);
    },
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
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
      await retryMutation.mutateAsync();
    } finally {
      actionLockRef.current = false;
    }
  }, [retryMutation]);

  const cancelProcessing = useCallback(async () => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    try {
      await cancelMutation.mutateAsync();
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
