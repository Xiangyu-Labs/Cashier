"use client";

import { useEffect, useRef, useState } from "react";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  createSourceDocumentAction,
  editRetrySourceDocumentAction,
} from "@/modules/source-document/actions";
import type { CreatedRecordResult } from "@/modules/source-document/contracts";
import type {
  SourceDocumentInputControllerMessages,
  SourceDocumentSubmitPayload,
} from "./source-document-input-controller.types";
import {
  SourceDocumentSubmissionUploadError,
  type SourceDocumentSubmissionProgress,
  uploadSourceDocumentSubmissionImages,
} from "./source-document-submission-upload";
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
  const [progress, setProgress] = useState<SourceDocumentSubmissionProgress | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const submissionIdentityRef = useRef({
    fingerprint: "",
    createId: crypto.randomUUID(),
    retryId: crypto.randomUUID(),
  });
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
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error(messages.networkError);
      return;
    }
    if (
      error instanceof TypeError ||
      /network|fetch failed|request (?:was )?aborted|connection/i.test(error.message)
    ) {
      toast.error(messages.networkError);
      return;
    }
    if (/validation|invalid|required|must be/i.test(error.message)) {
      toast.error(messages.validationError);
      return;
    }
    toast.error(fallbackMessage);
  };
  const finishUpload = (signal: AbortSignal) => {
    if (uploadControllerRef.current?.signal === signal) {
      uploadControllerRef.current = null;
    }
    setProgress(null);
  };

  // -----------------------------------------------------------------------
  // Create mutation
  // -----------------------------------------------------------------------

  const createMutation = useLedgerMutation<
    Awaited<ReturnType<typeof createSourceDocumentAction>>,
    CreateVariables
  >(ledgerId, {
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
      return result;
    },
    resourceGroups: ["documents"],
    successMessage: null,
    errorMessage: null,
    onSuccess: async (data, variables) => {
      try {
        submissionIdentityRef.current.createId = crypto.randomUUID();
        submissionIdentityRef.current.fingerprint = "";
        setMonotonicProgress({ phase: "complete", percent: 100 });
        await waitForPaint();
        onSuccess?.({
          sourceDocumentId: data.sourceDocumentId,
          entryDate: variables.payload.entryDate,
        });
      } finally {
        finishUpload(variables.signal);
      }
    },
    onError: (error, variables) => {
      handleSubmitError(error, messages.createError);
      finishUpload(variables.signal);
    },
  });

  // -----------------------------------------------------------------------
  // Retry mutation
  // -----------------------------------------------------------------------

  const retryMutation = useLedgerMutation<
    Awaited<ReturnType<typeof editRetrySourceDocumentAction>>,
    RetryVariables
  >(ledgerId, {
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
      return result;
    },
    resourceGroups: ["documents"],
    successMessage: messages.retrySuccess,
    errorMessage: null,
    onSuccess: async (data, variables) => {
      try {
        submissionIdentityRef.current.retryId = crypto.randomUUID();
        submissionIdentityRef.current.fingerprint = "";
        setMonotonicProgress({ phase: "complete", percent: 100 });
        await waitForPaint();
        onSuccess?.({
          sourceDocumentId: data.sourceDocumentId,
          entryDate: variables.payload.entryDate,
        });
      } finally {
        finishUpload(variables.signal);
      }
    },
    onError: (error, variables) => {
      handleSubmitError(error, messages.retryError);
      finishUpload(variables.signal);
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
    const fingerprint = JSON.stringify(payload);
    if (submissionIdentityRef.current.fingerprint !== fingerprint) {
      submissionIdentityRef.current = {
        fingerprint,
        createId: crypto.randomUUID(),
        retryId: crypto.randomUUID(),
      };
    }
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
        const operationId = submissionIdentityRef.current.retryId;
        retryMutation.mutate({ payload, operationId, signal: controller.signal });
        return;
      }

      const operationId = crypto.randomUUID();
      const clientSubmissionId = submissionIdentityRef.current.createId;
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
