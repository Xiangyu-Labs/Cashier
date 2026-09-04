"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  createSourceDocumentAction,
  editRetrySourceDocumentAction,
} from "@/modules/source-document/actions";
import type {
  CreatedRecordResult,
  RetrySourceDocumentResponseDto,
} from "@/modules/source-document/contracts";
import type {
  SourceDocumentInputControllerMessages,
  SourceDocumentSubmitPayload,
} from "./source-document-input-controller.types";
import { uploadSourceDocumentSubmissionImages } from "./source-document-submission-upload";
import { useSubmitProgress } from "./source-document-submit-progress";
import { unwrapVersionedCommandResult } from "@/modules/source-document/command-results";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateVariables {
  payload: SourceDocumentSubmitPayload;
  payloadFingerprint: string;
  clientSubmissionId: string;
  signal: AbortSignal;
}

interface RetryVariables {
  payload: SourceDocumentSubmitPayload;
  signal: AbortSignal;
}

interface CreateSubmissionIdentity {
  payloadFingerprint: string;
  clientSubmissionId: string;
  uploadedPayload: SourceDocumentSubmitPayload | null;
}

interface UseSourceDocumentSubmitMutationsOptions {
  ledgerId: string;
  mode: "create" | "retry";
  sourceDocumentId?: string;
  sourceDocumentVersion?: number;
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
  sourceDocumentVersion,
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
  const createSubmissionIdentityRef = useRef<CreateSubmissionIdentity | null>(null);
  // -----------------------------------------------------------------------
  // Create mutation
  // -----------------------------------------------------------------------

  const createMutation = useLedgerMutation<
    Awaited<ReturnType<typeof createSourceDocumentAction>>,
    CreateVariables
  >(ledgerId, {
    mutationFn: async (variables: CreateVariables) => {
      const currentIdentity = createSubmissionIdentityRef.current;
      let uploadedPayload =
        currentIdentity?.clientSubmissionId === variables.clientSubmissionId &&
        currentIdentity.payloadFingerprint === variables.payloadFingerprint
          ? currentIdentity.uploadedPayload
          : null;
      if (uploadedPayload == null) {
        uploadedPayload = await uploadSourceDocumentSubmissionImages(
          ledgerId,
          variables.payload,
          { signal: variables.signal },
          setMonotonicProgress
        );
        if (
          createSubmissionIdentityRef.current?.clientSubmissionId ===
            variables.clientSubmissionId &&
          createSubmissionIdentityRef.current.payloadFingerprint === variables.payloadFingerprint
        ) {
          createSubmissionIdentityRef.current.uploadedPayload = uploadedPayload;
        }
      }
      setMonotonicProgress({ phase: "submitting", percent: 90 });
      const result = await createSourceDocumentAction(
        ledgerId,
        uploadedPayload,
        variables.clientSubmissionId
      );
      return result;
    },
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    successMessage: null,
    errorMessage: null,
    onSuccess: async (data, variables) => {
      try {
        if (
          createSubmissionIdentityRef.current?.clientSubmissionId === variables.clientSubmissionId
        ) {
          createSubmissionIdentityRef.current = null;
        }
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

  const retryMutation = useLedgerMutation<RetrySourceDocumentResponseDto, RetryVariables>(
    ledgerId,
    {
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
          sourceDocumentVersion ?? 1
        );
        return unwrapVersionedCommandResult(result);
      },
      invalidationErrorMessage: tCommon("savedRefreshFailed"),
      successMessage: messages.retrySuccess,
      errorMessage: null,
      onSuccess: async (data, variables) => {
        try {
          setMonotonicProgress({ phase: "complete", percent: 100 });
          await waitForPaint();
          onSuccess?.({
            sourceDocumentId: sourceDocumentId!,
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
    }
  );

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
    const payloadFingerprint = JSON.stringify(payload);
    if (mode === "create") {
      const currentIdentity = createSubmissionIdentityRef.current;
      if (currentIdentity?.payloadFingerprint !== payloadFingerprint) {
        createSubmissionIdentityRef.current = {
          payloadFingerprint,
          clientSubmissionId: crypto.randomUUID(),
          uploadedPayload: null,
        };
      }
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
        retryMutation.mutate({ payload, signal: controller.signal });
        return;
      }

      createMutation.mutate({
        payload,
        payloadFingerprint,
        clientSubmissionId: createSubmissionIdentityRef.current!.clientSubmissionId,
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
