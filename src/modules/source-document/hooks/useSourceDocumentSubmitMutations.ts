"use client";

import type { QueryClient } from "@tanstack/react-query";
import {
  invalidateSourceDocumentAttention,
  invalidateSourceDocumentCompleted,
  invalidateSourceDocumentCounts,
  queryKeys,
} from "@/lib/query-keys";
import { useLedgerMutation, createListSnapshots } from "@/lib/mutations/use-ledger-mutation";
import {
  createSourceDocumentAction,
  editRetrySourceDocumentAction,
} from "@/modules/source-document/actions";
import type { SourceDocumentAttentionDto, SourceDocumentListItemDto } from "@/modules/source-document/contracts";
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
  previousAttention?: [readonly unknown[], unknown][];
  previousPending?: unknown;
  clientSubmissionId: string;
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
  // Selective invalidation: attention, completed pages, counts (not the entire sourceDocuments prefix)
  fireAndForget(
    queryClient.invalidateQueries({
      predicate: invalidateSourceDocumentAttention(ledgerId),
    }),
    { context: "SourceDocumentInput" }
  );
  fireAndForget(
    queryClient.invalidateQueries({
      predicate: invalidateSourceDocumentCompleted(ledgerId),
    }),
    { context: "SourceDocumentInput" }
  );
  fireAndForget(
    queryClient.invalidateQueries({
      predicate: invalidateSourceDocumentCounts(ledgerId),
    }),
    { context: "SourceDocumentInput" }
  );
}

/**
 * Insert a placeholder source document into the attention query cache.
 * Returns the generated client-side submission id and snapshots for rollback.
 */
function insertPlaceholderIntoAttention(
  queryClient: QueryClient,
  ledgerId: string
): { clientSubmissionId: string; snapshots: [readonly unknown[], unknown][] } {
  const clientSubmissionId = crypto.randomUUID();
  const now = new Date().toISOString();

  const snapshots = createListSnapshots<SourceDocumentAttentionDto>(
    queryClient,
    queryKeys.sourceDocumentAttention(ledgerId)
  );

  const placeholder: SourceDocumentListItemDto = {
    id: clientSubmissionId,
    ledgerId,
    title: null,
    text: null,
    files: [],
    status: "queued",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    hasImages: false,
    supportedActions: ["delete"],
    errorCode: null,
    pendingRevisionId: null,
    ledgerEntries: [],
  };

  queryClient.setQueryData<SourceDocumentAttentionDto>(
    queryKeys.sourceDocumentAttention(ledgerId),
    (old) => {
      if (!old) return { items: [placeholder], total: 1 };
      return {
        ...old,
        items: [placeholder, ...old.items],
        total: old.total + 1,
      };
    }
  );

  return { clientSubmissionId, snapshots };
}

/**
 * Remove a placeholder from the attention cache by client submission id.
 */
function removePlaceholderFromAttention(
  queryClient: QueryClient,
  ledgerId: string,
  clientSubmissionId: string
) {
  queryClient.setQueryData<SourceDocumentAttentionDto>(
    queryKeys.sourceDocumentAttention(ledgerId),
    (old) => {
      if (!old) return old;
      return {
        ...old,
        items: old.items.filter((item) => item.id !== clientSubmissionId),
        total: Math.max(0, old.total - 1),
      };
    }
  );
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
    cancelPredicates: [createExactPredicate(queryKeys.sourceDocumentAttention(ledgerId))],
    skipInvalidation: true,
    onOptimisticUpdate: async (queryClient) => {
      const previousPending = queryClient.getQueryData(
        queryKeys.sourceDocuments(ledgerId, "pending")
      );

      // Insert placeholder into attention cache
      const { clientSubmissionId, snapshots: attentionSnapshots } =
        insertPlaceholderIntoAttention(queryClient, ledgerId);

      return {
        previousAttention: attentionSnapshots,
        previousPending,
        clientSubmissionId,
      };
    },
    onRollback: (queryClient, context) => {
      if (!context) return;

      // Restore attention cache from snapshot
      if (context.previousAttention) {
        context.previousAttention.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }

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
    cancelPredicates: [invalidateSourceDocumentAttention(ledgerId)],
    skipInvalidation: true,
    onOptimisticUpdate: async (queryClient, payload) => {
      const previousDocument =
        sourceDocumentId != null
          ? queryClient.getQueryData(queryKeys.sourceDocument(sourceDocumentId))
          : undefined;

      if (sourceDocumentId != null) {
        queryClient.setQueryData(
          queryKeys.sourceDocument(sourceDocumentId),
          (current: unknown | undefined) => {
            if (current == null) return current;

            return {
              ...(current as Record<string, unknown>),
              status: "processing",
              ...(payload.text !== undefined && payload.text !== "" ? { text: payload.text } : {}),
            };
          }
        );
      }

      return { previousDocument };
    },
    onRollback: (queryClient, context) => {
      if (sourceDocumentId == null || context?.previousDocument === undefined) return;

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
