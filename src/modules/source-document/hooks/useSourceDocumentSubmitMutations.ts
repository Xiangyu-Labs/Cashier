"use client";

import { invalidateSourceDocuments, queryKeys } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  createSourceDocumentAction,
  editRetrySourceDocumentAction,
} from "@/modules/source-document/actions";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { fireAndForget } from "@/lib/safe-async";
import { toast } from "sonner";
import type {
  SourceDocumentInputControllerMessages,
  SourceDocumentSubmitPayload,
} from "./source-document-input-controller.types";
import {
  SourceDocumentSubmissionUploadError,
  uploadSourceDocumentSubmissionImages,
} from "./source-document-submission-upload";

type QueryPredicate = (query: { queryKey: readonly unknown[] }) => boolean;

interface CreateRollbackContext {
  previousPending?: unknown;
}

interface RetryRollbackContext {
  previousDocument?: unknown;
}

interface UseSourceDocumentSubmitMutationsOptions {
  ledgerId: string;
  mode: "create" | "retry";
  sourceDocumentId?: string;
  messages: SourceDocumentInputControllerMessages;
  onSuccess?: () => void;
}

function createExactPredicate(target: readonly unknown[]): QueryPredicate {
  return (query) =>
    Array.isArray(query.queryKey) &&
    query.queryKey.length === target.length &&
    target.every((value, index) => query.queryKey[index] === value);
}

function invalidateSubmitQueries(
  queryClient: {
    invalidateQueries: (options: { predicate: QueryPredicate }) => Promise<unknown>;
  },
  ledgerId: string
) {
  fireAndForget(queryClient.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) }), {
    context: "SourceDocumentInput",
  });
}

export function useSourceDocumentSubmitMutations({
  ledgerId,
  mode,
  sourceDocumentId,
  messages,
  onSuccess,
}: UseSourceDocumentSubmitMutationsOptions) {
  const handleSubmitError = (error: Error, fallbackMessage: string) => {
    console.error("Source document submission failed:", error);
    if (error instanceof SourceDocumentSubmissionUploadError) {
      toast.error(error.stage === "prepare" ? messages.imageReadError : messages.imageUploadError);
      return;
    }
    toast.error(fallbackMessage);
  };

  const createMutation = useLedgerMutation<
    unknown,
    SourceDocumentSubmitPayload,
    CreateRollbackContext
  >(ledgerId, {
    mutationFn: async (payload) =>
      createSourceDocumentAction(
        ledgerId,
        await uploadSourceDocumentSubmissionImages(ledgerId, payload)
      ),
    successMessage: messages.uploadSuccess,
    errorMessage: null,
    cancelPredicates: [createExactPredicate(queryKeys.sourceDocuments(ledgerId, "pending"))],
    skipInvalidation: true,
    onOptimisticUpdate: async (queryClient) => {
      const previousPending = queryClient.getQueryData(
        queryKeys.sourceDocuments(ledgerId, "pending")
      );

      return { previousPending };
    },
    onRollback: (queryClient, context) => {
      if (context.previousPending !== undefined) {
        queryClient.setQueryData(
          queryKeys.sourceDocuments(ledgerId, "pending"),
          context.previousPending
        );
      }
    },
    onSettledExtra: (queryClient) => {
      invalidateSubmitQueries(queryClient, ledgerId);
    },
    ...(onSuccess == null ? {} : { onSuccessExtra: onSuccess }),
    onErrorExtra: (error) => handleSubmitError(error, messages.uploadError),
  });

  const retryMutation = useLedgerMutation<
    unknown,
    SourceDocumentSubmitPayload,
    RetryRollbackContext
  >(ledgerId, {
    mutationFn: async (payload) => {
      if (sourceDocumentId == null) return;
      await editRetrySourceDocumentAction(
        ledgerId,
        sourceDocumentId,
        await uploadSourceDocumentSubmissionImages(ledgerId, payload)
      );
    },
    successMessage: messages.retrySuccess,
    errorMessage: null,
    cancelPredicates: [invalidateSourceDocuments(ledgerId)],
    skipInvalidation: true,
    onOptimisticUpdate: async (queryClient, payload) => {
      const previousDocument =
        sourceDocumentId != null
          ? queryClient.getQueryData(queryKeys.sourceDocument(sourceDocumentId))
          : undefined;

      if (sourceDocumentId != null) {
        queryClient.setQueryData(
          queryKeys.sourceDocument(sourceDocumentId),
          (current: SourceDocument | undefined) => {
            if (current == null) return current;

            return {
              ...current,
              status: "processing",
              ...(payload.text !== undefined && payload.text !== "" ? { text: payload.text } : {}),
            };
          }
        );
      }

      return { previousDocument };
    },
    onRollback: (queryClient, context) => {
      if (sourceDocumentId == null || context.previousDocument === undefined) return;

      queryClient.setQueryData(
        queryKeys.sourceDocument(sourceDocumentId),
        context.previousDocument
      );
    },
    onSettledExtra: (queryClient) => {
      invalidateSubmitQueries(queryClient, ledgerId);
    },
    ...(onSuccess == null ? {} : { onSuccessExtra: onSuccess }),
    onErrorExtra: (error) => handleSubmitError(error, messages.retryError),
  });

  const activeMutation = mode === "retry" ? retryMutation : createMutation;

  const submit = (payload: SourceDocumentSubmitPayload) => {
    if (mode === "retry") {
      if (sourceDocumentId == null) return false;
      retryMutation.mutate(payload);
      return true;
    }

    createMutation.mutate(payload);
    return true;
  };

  return {
    isPending: activeMutation.isPending,
    submit,
  };
}
