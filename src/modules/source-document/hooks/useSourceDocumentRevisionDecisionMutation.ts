"use client";

import { useTranslations } from "next-intl";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";

interface UseSourceDocumentRevisionDecisionMutationOptions<TResult> {
  ledgerId: string;
  sourceDocumentId: string;
  revisionId?: string;
  action: (ledgerId: string, sourceDocumentId: string, revisionId: string) => Promise<TResult>;
  successMessage: string;
  errorMessage: string;
  onSuccess?: (result: TResult) => void | Promise<void>;
}

export function useSourceDocumentRevisionDecisionMutation<TResult>({
  ledgerId,
  sourceDocumentId,
  revisionId,
  action,
  successMessage,
  errorMessage,
  onSuccess,
}: UseSourceDocumentRevisionDecisionMutationOptions<TResult>) {
  const tCommon = useTranslations("Common");

  return useLedgerMutation<TResult, void>(ledgerId, {
    mutationFn: () => {
      if (revisionId == null || revisionId === "") {
        throw new Error("Source document review revision is unavailable");
      }
      return action(ledgerId, sourceDocumentId, revisionId);
    },
    resourceGroups: ["documents"],
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    successMessage,
    errorMessage,
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });
}
