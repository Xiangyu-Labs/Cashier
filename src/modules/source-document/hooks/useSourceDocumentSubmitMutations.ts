"use client";

import { useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import {
  queryKeys,
  invalidateSourceDocumentCounts,
} from "@/lib/query-keys";
import {
  createSourceDocumentAction,
  editRetrySourceDocumentAction,
} from "@/modules/source-document/actions";
import {
  CacheTransactionManager,
} from "@/lib/mutations/cache-transaction";
import type {
  CreateSourceDocumentResponseDto,
  SourceDocumentListItemDto,
  MutationReconciliation,
} from "@/modules/source-document/contracts";
import type {
  SourceDocumentInputControllerMessages,
  SourceDocumentSubmitPayload,
} from "./source-document-input-controller.types";
import {
  SourceDocumentSubmissionUploadError,
  uploadSourceDocumentSubmissionImages,
} from "./source-document-submission-upload";
import { notifyNewSubmission } from "./revision-state-refresh";
import {
  applyOptimisticUpsert,
  applyOptimisticDelete,
} from "./source-document-optimistic-cache";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateVariables {
  payload: SourceDocumentSubmitPayload;
  operationId: string;
  clientSubmissionId: string;
}

interface RetryVariables {
  payload: SourceDocumentSubmitPayload;
  operationId: string;
}

interface UseSourceDocumentSubmitMutationsOptions {
  ledgerId: string;
  mode: "create" | "retry";
  sourceDocumentId?: string;
  messages: SourceDocumentInputControllerMessages;
  onSuccess?: () => void;
}

// ---------------------------------------------------------------------------
// Placeholder builder
// ---------------------------------------------------------------------------

function buildPlaceholder(
  ledgerId: string,
  clientSubmissionId: string,
  payload: SourceDocumentSubmitPayload
): SourceDocumentListItemDto {
  const now = new Date().toISOString();
  const entity = {
    id: clientSubmissionId,
    ledgerId,
    title: null,
    text: null,
    files: [],
    status: "queued",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: payload.entryDate ?? null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    hasImages: (payload.images?.length ?? 0) > 0 || (payload.storedFileIds?.length ?? 0) > 0,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: null,
    ledgerEntries: [],
  };
  return entity as unknown as SourceDocumentListItemDto;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSourceDocumentSubmitMutations({
  ledgerId,
  mode,
  sourceDocumentId,
  messages,
  onSuccess,
}: UseSourceDocumentSubmitMutationsOptions) {
  const queryClient = useQueryClient();
  const transactionRef = useRef<CacheTransactionManager>(new CacheTransactionManager());

  const handleSubmitError = (error: Error, fallbackMessage: string) => {
    console.error("Source document submission failed:", error);
    if (error instanceof SourceDocumentSubmissionUploadError) {
      toast.error(error.stage === "prepare" ? messages.imageReadError : messages.imageUploadError);
      return;
    }
    toast.error(fallbackMessage);
  };

  // -----------------------------------------------------------------------
  // Create mutation
  // -----------------------------------------------------------------------

  const createMutation = useMutation({
    mutationFn: async (variables: CreateVariables) => {
      const { payload, clientSubmissionId } = variables;
      const uploadedPayload = await uploadSourceDocumentSubmissionImages(ledgerId, payload);
      return createSourceDocumentAction(
        ledgerId,
        uploadedPayload,
        variables.operationId,
        clientSubmissionId
      );
    },
    onMutate: async (variables: CreateVariables) => {
      const { payload, operationId, clientSubmissionId } = variables;

      // Start transaction operation
      const op = transactionRef.current.startOperation(ledgerId);

      // Build a queued placeholder entity
      const placeholder = buildPlaceholder(ledgerId, clientSubmissionId, payload);

      // Record the patch for rollback
      const streamKey = queryKeys.sourceDocumentStreamPrefix(ledgerId);
      const snapshot = queryClient.getQueriesData({ queryKey: streamKey });
      op.patches.push({
        type: "upsert",
        entityId: clientSubmissionId,
        entity: placeholder,
        prevEntity: null, // Entity is new
      });

      // Apply optimistic upsert to stream cache
      applyOptimisticUpsert(queryClient, ledgerId, placeholder);

      return { clientSubmissionId: variables.clientSubmissionId, operationId };
    },
    onSuccess: (data, variables) => {
      const opId = variables.operationId;

      if (data != null) {
        const response = data as CreateSourceDocumentResponseDto &
          Partial<{
            reconciliation: MutationReconciliation<SourceDocumentListItemDto>;
          }>;

        if (response.reconciliation?.entity != null) {
          transactionRef.current.commitOperation(
            opId,
            response.reconciliation.entity,
            queryClient
          );
        } else {
          transactionRef.current.commitOperation(opId, null, queryClient);
        }
      } else {
        transactionRef.current.commitOperation(opId, null, queryClient);
      }

      toast.success(messages.uploadSuccess);
      notifyNewSubmission();
      onSuccess?.();
    },
    onError: (error, variables) => {
      // Roll back the operation
      transactionRef.current.rollbackOperation(variables.operationId, queryClient);
      handleSubmitError(error, messages.uploadError);
    },
    onSettled: () => {
      // Minimal invalidation for counts only (stream cache is patched)
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentCounts(ledgerId),
      });
    },
  });

  // -----------------------------------------------------------------------
  // Retry mutation
  // -----------------------------------------------------------------------

  const retryMutation = useMutation({
    mutationFn: async (variables: RetryVariables) => {
      if (sourceDocumentId == null) throw new Error("No source document ID for retry");
      const { payload } = variables;
      const uploadedPayload = await uploadSourceDocumentSubmissionImages(ledgerId, payload);
      return editRetrySourceDocumentAction(
        ledgerId,
        sourceDocumentId,
        uploadedPayload,
        variables.operationId
      );
    },
    onMutate: async (variables: RetryVariables) => {
      const { operationId } = variables;

      // Start transaction operation
      const op = transactionRef.current.startOperation(ledgerId);

      // Capture current entity from stream cache for rollback
      const placeholder: SourceDocumentListItemDto = {
        id: sourceDocumentId ?? "",
        ledgerId,
        title: null,
        text: null,
        files: [],
        status: "queued",
        type: "ai_parsed",
        anomalyReason: null,
        entryDate: null,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        hasImages: false,
        supportedActions: [],
        errorCode: null,
        pendingRevisionId: null,
        ledgerEntries: [],
      };

      op.patches.push({
        type: "upsert",
        entityId: sourceDocumentId ?? "",
        entity: placeholder,
        prevEntity: null, // We don't have the previous entity from stream cache
      });

      // Apply optimistic update to stream cache
      if (sourceDocumentId != null) {
        applyOptimisticUpsert(queryClient, ledgerId, placeholder);
      }

      return { operationId };
    },
    onSuccess: (data, variables) => {
      const opId = variables.operationId;

      if (data != null) {
        const response = data as Partial<{
          reconciliation: MutationReconciliation<SourceDocumentListItemDto>;
        }>;

        if (response.reconciliation?.entity != null) {
          transactionRef.current.commitOperation(
            opId,
            response.reconciliation.entity,
            queryClient
          );
        } else {
          transactionRef.current.commitOperation(opId, null, queryClient);
        }
      } else {
        transactionRef.current.commitOperation(opId, null, queryClient);
      }

      toast.success(messages.retrySuccess);
      notifyNewSubmission();
      onSuccess?.();
    },
    onError: (error, variables) => {
      transactionRef.current.rollbackOperation(variables.operationId, queryClient);
      handleSubmitError(error, messages.retryError);
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentCounts(ledgerId),
      });
    },
  });

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  const activeMutation = mode === "retry" ? retryMutation : createMutation;

  const submit = (payload: SourceDocumentSubmitPayload) => {
    if (mode === "retry") {
      if (sourceDocumentId == null) return false;
      const operationId = crypto.randomUUID();
      retryMutation.mutate({ payload, operationId });
      return true;
    }

    const operationId = crypto.randomUUID();
    const clientSubmissionId = crypto.randomUUID();
    createMutation.mutate({ payload, operationId, clientSubmissionId });
    return true;
  };

  return {
    isPending: activeMutation.isPending,
    submit,
  };
}
