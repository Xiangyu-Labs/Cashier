"use client";

import { useTranslations } from "next-intl";
import type { UseLedgerMutationOptions } from "@/lib/mutations/use-ledger-mutation";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import type { VersionedCommandResult } from "@/modules/source-document/contracts";
import {
  requireSourceDocumentVersion,
  unwrapVersionedCommandResult,
} from "@/modules/source-document/command-results";

interface UseVersionedSourceDocumentMutationOptions<TResult> {
  ledgerId: string | undefined;
  sourceDocumentId: string;
  expectedVersion: number | null;
  action: (
    ledgerId: string,
    sourceDocumentId: string,
    expectedVersion: number
  ) => Promise<VersionedCommandResult<TResult>>;
  successMessage: string;
  errorMessage: string | null;
  onSuccess?: UseLedgerMutationOptions<TResult, void>["onSuccess"];
  onError?: UseLedgerMutationOptions<TResult, void>["onError"];
}

export function useVersionedSourceDocumentMutation<TResult>({
  ledgerId,
  sourceDocumentId,
  expectedVersion,
  action,
  successMessage,
  errorMessage,
  onSuccess,
  onError,
}: UseVersionedSourceDocumentMutationOptions<TResult>) {
  const tCommon = useTranslations("Common");
  return useLedgerMutation<TResult, void>(ledgerId, {
    mutationFn: async () => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      const version = requireSourceDocumentVersion(expectedVersion, sourceDocumentId);
      const result = await action(ledgerId, sourceDocumentId, version);
      return unwrapVersionedCommandResult(result);
    },
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    successMessage,
    errorMessage,
    ...(onSuccess === undefined ? {} : { onSuccess }),
    ...(onError === undefined ? {} : { onError }),
  });
}
