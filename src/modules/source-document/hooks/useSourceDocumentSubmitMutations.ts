"use client";

import { invalidateSourceDocuments, invalidateTaskQueue, queryKeys } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  createSourceDocumentAction,
  retrySourceDocumentAction,
} from "@/modules/source-document/actions";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { fireAndForget } from "@/lib/safe-async";
import type {
  SourceDocumentInputControllerMessages,
  SourceDocumentSubmitPayload,
} from "./source-document-input-controller.types";

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
  fireAndForget(queryClient.invalidateQueries({ predicate: invalidateTaskQueue(ledgerId) }), {
    context: "SourceDocumentInput",
  });
}

export function useSourceDocumentSubmitMutations({
  ledgerId,
  mode,
  sourceDocumentId,
  messages,
}: UseSourceDocumentSubmitMutationsOptions) {
  const createMutation = useLedgerMutation<
    unknown,
    SourceDocumentSubmitPayload,
    CreateRollbackContext
  >(ledgerId, {
    mutationFn: async (payload) => createSourceDocumentAction(ledgerId, payload),
    successMessage: messages.uploadSuccess,
    errorMessage: messages.uploadError,
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
  });

  const retryMutation = useLedgerMutation<
    unknown,
    SourceDocumentSubmitPayload,
    RetryRollbackContext
  >(ledgerId, {
    mutationFn: async (payload) => {
      if (sourceDocumentId == null) return;
      await retrySourceDocumentAction(ledgerId, sourceDocumentId, payload);
    },
    successMessage: messages.retrySuccess,
    errorMessage: messages.retryError,
    cancelPredicates: [invalidateSourceDocuments(ledgerId), invalidateTaskQueue(ledgerId)],
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
