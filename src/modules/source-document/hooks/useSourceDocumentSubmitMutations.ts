"use client";

import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { invalidateSourceDocumentCounts } from "@/lib/query-keys";
import {
  createSourceDocumentAction,
  editRetrySourceDocumentAction,
} from "@/modules/source-document/actions";
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
  type SourceDocumentSubmissionProgress,
  uploadSourceDocumentSubmissionImages,
} from "./source-document-submission-upload";
import { useNotifyRevisionRefresh } from "./revision-state-refresh";
import { applyOptimisticUpsert } from "./source-document-optimistic-cache";
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
  const notifyRefresh = useNotifyRevisionRefresh();
  const [progress, setProgress] = useState<SourceDocumentSubmissionProgress | null>(null);

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
      const uploadedPayload = await uploadSourceDocumentSubmissionImages(
        ledgerId,
        payload,
        undefined,
        setProgress
      );
      setProgress({ phase: "submitting" });
      return createSourceDocumentAction(
        ledgerId,
        uploadedPayload,
        variables.operationId,
        clientSubmissionId
      );
    },
    onSuccess: (data) => {
      if (data != null) {
        const response = data as CreateSourceDocumentResponseDto &
          Partial<{
            reconciliation: MutationReconciliation<SourceDocumentListItemDto>;
          }>;

        if (response.reconciliation?.entity != null) {
          applyOptimisticUpsert(queryClient, ledgerId, response.reconciliation.entity);
        }
      }

      toast.success(messages.uploadSuccess);
      notifyRefresh();
      onSuccess?.();
    },
    onError: (error) => {
      handleSubmitError(error, messages.uploadError);
    },
    onSettled: () => {
      setProgress(null);
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
      const uploadedPayload = await uploadSourceDocumentSubmissionImages(
        ledgerId,
        payload,
        undefined,
        setProgress
      );
      setProgress({ phase: "submitting" });
      return editRetrySourceDocumentAction(
        ledgerId,
        sourceDocumentId,
        uploadedPayload,
        variables.operationId
      );
    },
    onSuccess: (data) => {
      if (data != null) {
        const response = data as Partial<{
          reconciliation: MutationReconciliation<SourceDocumentListItemDto>;
        }>;

        if (response.reconciliation?.entity != null) {
          applyOptimisticUpsert(queryClient, ledgerId, response.reconciliation.entity);
        }
      }

      toast.success(messages.retrySuccess);
      notifyRefresh();
      onSuccess?.();
    },
    onError: (error) => {
      handleSubmitError(error, messages.retryError);
    },
    onSettled: () => {
      setProgress(null);
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
      // C1: Generate a single operationId used for both the server action and the transaction
      const operationId = crypto.randomUUID();
      retryMutation.mutate({ payload, operationId });
      return true;
    }

    // C1: Generate a single operationId
    const operationId = crypto.randomUUID();
    const clientSubmissionId = crypto.randomUUID();
    createMutation.mutate({ payload, operationId, clientSubmissionId });
    return true;
  };

  return {
    isPending: activeMutation.isPending,
    progress,
    submit,
  };
}
