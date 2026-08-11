"use client";

import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { invalidateSourceDocumentCounts } from "@/lib/query-keys";
import {
  createSourceDocumentAction,
  editRetrySourceDocumentAction,
} from "@/modules/source-document/actions";
import type {
  CreatedRecordResult,
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
  signal: AbortSignal;
}

interface RetryVariables {
  payload: SourceDocumentSubmitPayload;
  operationId: string;
  signal: AbortSignal;
}

interface UseSourceDocumentSubmitMutationsOptions {
  ledgerId: string;
  mode: "create" | "retry";
  sourceDocumentId?: string;
  messages: SourceDocumentInputControllerMessages;
  onSuccess?: (result: CreatedRecordResult) => void;
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => resolve());
    } else {
      globalThis.setTimeout(resolve, 0);
    }
  });
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
  const uploadControllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => uploadControllerRef.current?.abort(), []);
  const setMonotonicProgress = (next: SourceDocumentSubmissionProgress) => {
    setProgress((current) => {
      if (current?.phase === "cancelling") return current;
      return current != null && current.percent > next.percent
        ? { ...next, percent: current.percent }
        : next;
    });
  };

  const handleSubmitError = (error: Error, fallbackMessage: string) => {
    if (error instanceof DOMException && error.name === "AbortError") return;
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
        { signal: variables.signal },
        setMonotonicProgress
      );
      setMonotonicProgress({ phase: "submitting", percent: 90 });
      const result = await createSourceDocumentAction(
        ledgerId,
        uploadedPayload,
        variables.operationId,
        clientSubmissionId
      );
      setMonotonicProgress({ phase: "submitting", percent: 99 });
      return result;
    },
    onSuccess: async (data, variables) => {
      setMonotonicProgress({ phase: "complete", percent: 100 });
      if (data != null) {
        const response = data as CreateSourceDocumentResponseDto &
          Partial<{
            reconciliation: MutationReconciliation<SourceDocumentListItemDto>;
          }>;

        if (response.reconciliation?.entity != null) {
          applyOptimisticUpsert(queryClient, ledgerId, response.reconciliation.entity);
        }
      }

      notifyRefresh();
      await waitForPaint();
      onSuccess?.({
        sourceDocumentId: data.sourceDocumentId,
        entryDate: variables.payload.entryDate,
      });
    },
    onError: (error) => {
      handleSubmitError(error, messages.uploadError);
    },
    onSettled: (_data, _error, variables) => {
      if (uploadControllerRef.current?.signal === variables.signal) {
        uploadControllerRef.current = null;
      }
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
        { signal: variables.signal },
        setMonotonicProgress
      );
      setMonotonicProgress({ phase: "submitting", percent: 90 });
      const result = await editRetrySourceDocumentAction(
        ledgerId,
        sourceDocumentId,
        uploadedPayload,
        variables.operationId
      );
      setMonotonicProgress({ phase: "submitting", percent: 99 });
      return result;
    },
    onSuccess: async (data, variables) => {
      setMonotonicProgress({ phase: "complete", percent: 100 });
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
      await waitForPaint();
      onSuccess?.({
        sourceDocumentId: data.sourceDocumentId,
        entryDate: variables.payload.entryDate,
      });
    },
    onError: (error) => {
      handleSubmitError(error, messages.retryError);
    },
    onSettled: (_data, _error, variables) => {
      if (uploadControllerRef.current?.signal === variables.signal) {
        uploadControllerRef.current = null;
      }
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
  const canCancel =
    progress?.phase === "preparing" ||
    progress?.phase === "planning" ||
    progress?.phase === "uploading";

  const submit = (payload: SourceDocumentSubmitPayload) => {
    if (mode === "retry" && sourceDocumentId == null) return false;
    if (activeMutation.isPending || progress != null) return false;
    uploadControllerRef.current?.abort();
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    setProgress({ phase: "preparing", percent: 0 });
    const startMutation = () => {
      if (controller.signal.aborted) {
        if (uploadControllerRef.current === controller) {
          uploadControllerRef.current = null;
          setProgress(null);
        }
        return;
      }
      if (mode === "retry") {
        if (sourceDocumentId == null) return;
        const operationId = crypto.randomUUID();
        retryMutation.mutate({ payload, operationId, signal: controller.signal });
        return;
      }

      const operationId = crypto.randomUUID();
      const clientSubmissionId = crypto.randomUUID();
      createMutation.mutate({
        payload,
        operationId,
        clientSubmissionId,
        signal: controller.signal,
      });
    };

    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(startMutation);
    } else {
      globalThis.setTimeout(startMutation, 0);
    }
    return true;
  };

  return {
    isPending: activeMutation.isPending || progress != null,
    progress,
    submit,
    canCancel,
    cancel: () => {
      if (!canCancel) return;
      uploadControllerRef.current?.abort();
      setProgress((current) =>
        current == null ? null : { ...current, phase: "cancelling" as const }
      );
    },
  };
}
