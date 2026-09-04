"use client";

import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import {
  abandonSourceDocumentCandidateAction,
  cancelSourceDocumentProcessingAction,
  retrySourceDocumentAction,
} from "@/modules/source-document/actions";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { unwrapVersionedCommandResult } from "@/modules/source-document/command-results";

export interface StreamRecoveryVariables {
  sourceDocumentId: string;
  expectedVersion: number;
}

type RecoveryAction = (variables: StreamRecoveryVariables) => Promise<unknown>;

export function useStreamSourceDocumentRecoveryMutations(ledgerId: string) {
  const tActions = useTranslations("CandidateAction");
  const tCommon = useTranslations("Common");
  const locksRef = useRef(new Set<string>());
  const [retryingIds, setRetryingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [cancellingIds, setCancellingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [abandoningIds, setAbandoningIds] = useState<ReadonlySet<string>>(() => new Set());

  const updatePending = useCallback(
    (
      setter: Dispatch<SetStateAction<ReadonlySet<string>>>,
      sourceDocumentId: string,
      pending: boolean
    ) => {
      setter((current) => {
        const next = new Set(current);
        if (pending) next.add(sourceDocumentId);
        else next.delete(sourceDocumentId);
        return next;
      });
    },
    []
  );

  const retryMutation = useLedgerMutation<unknown, StreamRecoveryVariables>(ledgerId, {
    mutationFn: async ({ sourceDocumentId, expectedVersion }) =>
      unwrapVersionedCommandResult(
        await retrySourceDocumentAction(ledgerId, sourceDocumentId, expectedVersion)
      ),
    successMessage: tActions("retrySuccess"),
    errorMessage: tActions("retryError"),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });
  const cancelMutation = useLedgerMutation<unknown, StreamRecoveryVariables>(ledgerId, {
    mutationFn: async ({ sourceDocumentId, expectedVersion }) =>
      unwrapVersionedCommandResult(
        await cancelSourceDocumentProcessingAction(ledgerId, sourceDocumentId, expectedVersion)
      ),
    successMessage: tActions("cancelSuccess"),
    errorMessage: tActions("cancelError"),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });
  const abandonMutation = useLedgerMutation<unknown, StreamRecoveryVariables>(ledgerId, {
    mutationFn: async ({ sourceDocumentId, expectedVersion }) =>
      unwrapVersionedCommandResult(
        await abandonSourceDocumentCandidateAction(ledgerId, sourceDocumentId, expectedVersion)
      ),
    successMessage: tActions("abandonSuccess"),
    errorMessage: tActions("abandonError"),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });
  const retryMutationRef = useRef(retryMutation.mutateAsync);
  const cancelMutationRef = useRef(cancelMutation.mutateAsync);
  const abandonMutationRef = useRef(abandonMutation.mutateAsync);
  retryMutationRef.current = retryMutation.mutateAsync;
  cancelMutationRef.current = cancelMutation.mutateAsync;
  abandonMutationRef.current = abandonMutation.mutateAsync;

  const run = useCallback(
    async (
      variables: StreamRecoveryVariables,
      action: RecoveryAction,
      setter: Dispatch<SetStateAction<ReadonlySet<string>>>
    ) => {
      if (locksRef.current.has(variables.sourceDocumentId)) return;
      locksRef.current.add(variables.sourceDocumentId);
      updatePending(setter, variables.sourceDocumentId, true);
      try {
        await action(variables);
      } catch {
        // The mutation owns user-visible error reporting.
      } finally {
        locksRef.current.delete(variables.sourceDocumentId);
        updatePending(setter, variables.sourceDocumentId, false);
      }
    },
    [updatePending]
  );

  const retry = useCallback(
    (variables: StreamRecoveryVariables) =>
      run(variables, retryMutationRef.current, setRetryingIds),
    [run]
  );
  const cancelProcessing = useCallback(
    (variables: StreamRecoveryVariables) =>
      run(variables, cancelMutationRef.current, setCancellingIds),
    [run]
  );
  const abandonCandidate = useCallback(
    (variables: StreamRecoveryVariables) =>
      run(variables, abandonMutationRef.current, setAbandoningIds),
    [run]
  );

  return useMemo(
    () => ({
      retryingIds,
      cancellingIds,
      abandoningIds,
      retry,
      cancelProcessing,
      abandonCandidate,
    }),
    [abandoningIds, abandonCandidate, cancellingIds, cancelProcessing, retry, retryingIds]
  );
}
