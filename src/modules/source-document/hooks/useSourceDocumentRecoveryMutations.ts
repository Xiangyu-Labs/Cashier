"use client";

import { useCallback, useRef } from "react";
import { cancelSourceDocumentProcessingAction } from "@/modules/source-document/server-actions/processing";
import { retrySourceDocumentAction } from "@/modules/source-document/server-actions/retry";
import { useTranslations } from "next-intl";
import { useVersionedSourceDocumentMutation } from "./useVersionedSourceDocumentMutation";

interface UseSourceDocumentRecoveryMutationsOptions {
  ledgerId: string;
  sourceDocumentId: string;
  /** Read fresh at submission time — never captured ahead of the actual click. */
  version: number | null;
  onSuccess?: () => void;
}

/**
 * Provides mutations for source document recovery actions:
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
  const tActions = useTranslations("SourceDocumentAction");

  // -----------------------------------------------------------------------
  // Direct retry
  // -----------------------------------------------------------------------

  const retryMutation = useVersionedSourceDocumentMutation({
    ledgerId,
    sourceDocumentId,
    expectedVersion: version,
    action: retrySourceDocumentAction,
    successMessage: tActions("retrySuccess"),
    errorMessage: tActions("retryError"),
    onSuccess: () => {
      onSuccess?.();
    },
  });

  const cancelMutation = useVersionedSourceDocumentMutation({
    ledgerId,
    sourceDocumentId,
    expectedVersion: version,
    action: cancelSourceDocumentProcessingAction,
    successMessage: tActions("cancelSuccess"),
    errorMessage: tActions("cancelError"),
    onSuccess: () => {
      onSuccess?.();
    },
  });

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

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
    retry,
    cancelProcessing,
    isRetrying: retryMutation.isPending,
    isCancelling: cancelMutation.isPending,
  };
}
