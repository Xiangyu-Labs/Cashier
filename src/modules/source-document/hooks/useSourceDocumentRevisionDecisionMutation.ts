"use client";

import type { VersionedCommandResult } from "@/modules/source-document/contracts";
import { useVersionedSourceDocumentMutation } from "./useVersionedSourceDocumentMutation";

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
  return useVersionedSourceDocumentMutation({
    ledgerId,
    sourceDocumentId,
    expectedVersion,
    action,
    successMessage,
    errorMessage,
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });
}
