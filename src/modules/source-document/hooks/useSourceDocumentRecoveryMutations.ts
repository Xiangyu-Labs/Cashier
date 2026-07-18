"use client";

import { invalidateSourceDocuments } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  acceptSourceDocumentCandidateAction,
  abandonSourceDocumentCandidateAction,
  createManualCorrectionAction,
  retrySourceDocumentAction,
} from "@/modules/source-document/actions";
import { useTranslations } from "next-intl";

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
 * - Manual correction
 * - Direct retry
 */
export function useSourceDocumentRecoveryMutations({
  ledgerId,
  sourceDocumentId,
  revisionId,
  onSuccess,
}: UseSourceDocumentRecoveryMutationsOptions) {
  const tActions = useTranslations("CandidateAction");

  const invalidationPredicates = [invalidateSourceDocuments(ledgerId)];

  const acceptMutation = useLedgerMutation<void, void>(ledgerId, {
    mutationFn: async () => {
      if (revisionId == null) throw new Error("No revision ID provided for accept");
      await acceptSourceDocumentCandidateAction(ledgerId, sourceDocumentId, revisionId);
    },
    successMessage: tActions("acceptSuccess"),
    errorMessage: tActions("acceptError"),
    invalidatePredicates: invalidationPredicates,
    ...(onSuccess == null ? {} : { onSuccessExtra: onSuccess }),
  });

  const abandonMutation = useLedgerMutation<void, void>(ledgerId, {
    mutationFn: async () => {
      if (revisionId == null) throw new Error("No revision ID provided for abandon");
      await abandonSourceDocumentCandidateAction(ledgerId, sourceDocumentId, revisionId);
    },
    successMessage: tActions("abandonSuccess"),
    errorMessage: tActions("abandonError"),
    invalidatePredicates: invalidationPredicates,
    ...(onSuccess == null ? {} : { onSuccessExtra: onSuccess }),
  });

  const manualCorrectionMutation = useLedgerMutation<void, void>(ledgerId, {
    mutationFn: async () => {
      await createManualCorrectionAction(ledgerId, sourceDocumentId);
    },
    successMessage: tActions("manualCorrectionSuccess"),
    errorMessage: tActions("manualCorrectionError"),
    invalidatePredicates: invalidationPredicates,
    ...(onSuccess == null ? {} : { onSuccessExtra: onSuccess }),
  });

  const retryMutation = useLedgerMutation<void, void>(ledgerId, {
    mutationFn: async () => {
      await retrySourceDocumentAction(ledgerId, sourceDocumentId);
    },
    successMessage: null,
    errorMessage: null,
    invalidatePredicates: invalidationPredicates,
    ...(onSuccess == null ? {} : { onSuccessExtra: onSuccess }),
  });

  return {
    acceptCandidate: acceptMutation.mutateAsync,
    abandonCandidate: abandonMutation.mutateAsync,
    createManualCorrection: manualCorrectionMutation.mutateAsync,
    retry: retryMutation.mutateAsync,
    isAccepting: acceptMutation.isPending,
    isAbandoning: abandonMutation.isPending,
    isCreatingManualCorrection: manualCorrectionMutation.isPending,
    isRetrying: retryMutation.isPending,
  };
}
