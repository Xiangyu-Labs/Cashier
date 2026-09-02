"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
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
import { uploadSourceDocumentSubmissionImages } from "./source-document-submission-upload";
import { useSubmitProgress } from "./source-document-submit-progress";

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
  const tCommon = useTranslations("Common");
  const {
    progress,
    setProgress,
    uploadControllerRef,
    setMonotonicProgress,
    handleSubmitError,
    finishUpload,
    canCancel,
    cancel,
  } = useSubmitProgress(messages);
  const submissionIdentityRef = useRef({
    fingerprint: "",
    createId: crypto.randomUUID(),
    retryId: crypto.randomUUID(),
  });

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
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
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
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
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
    cancel,
  };
}
