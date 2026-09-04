"use client";

import { useTranslations } from "next-intl";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import type { VersionedCommandResult } from "@/modules/source-document/contracts";
import {
  requireSourceDocumentVersion,
  unwrapVersionedCommandResult,
} from "@/modules/source-document/command-results";

interface UseSourceDocumentRevisionDecisionMutationOptions<TResult> {
  ledgerId: string;
  sourceDocumentId: string;
  /** Read fresh at submission time — never captured ahead of the actual click. */
  expectedVersion: number | null;
  action: (
    ledgerId: string,
    sourceDocumentId: string,
    expectedVersion: number
  ) => Promise<VersionedCommandResult<TResult>>;
  successMessage: string;
  errorMessage: string;
  onSuccess?: (result: TResult) => void | Promise<void>;
}

export function useSourceDocumentRevisionDecisionMutation<TResult>({
  ledgerId,
  sourceDocumentId,
  expectedVersion,
  action,
  successMessage,
  errorMessage,
  onSuccess,
}: UseSourceDocumentRevisionDecisionMutationOptions<TResult>) {
  const tCommon = useTranslations("Common");

  return useLedgerMutation<TResult, void>(ledgerId, {
    mutationFn: async () => {
      const version = requireSourceDocumentVersion(expectedVersion, sourceDocumentId);
      const result = await action(ledgerId, sourceDocumentId, version);
      return unwrapVersionedCommandResult(result);
    },
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    successMessage,
    errorMessage,
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });
}
