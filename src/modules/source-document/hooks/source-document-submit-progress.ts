"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { SourceDocumentInputControllerMessages } from "./source-document-input-controller.types";
import {
  SourceDocumentSubmissionUploadError,
  type SourceDocumentSubmissionProgress,
} from "./source-document-submission-upload";

/** Owns submit progress state, cancellation, and error-message routing shared by create/retry. */
export function useSubmitProgress(messages: SourceDocumentInputControllerMessages) {
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

  const canCancel =
    progress?.phase === "preparing" ||
    progress?.phase === "planning" ||
    progress?.phase === "uploading";

  const cancel = () => {
    if (!canCancel) return;
    uploadControllerRef.current?.abort();
    setProgress((current) =>
      current == null ? null : { ...current, phase: "cancelling" as const }
    );
  };

  return {
    progress,
    setProgress,
    uploadControllerRef,
    setMonotonicProgress,
    handleSubmitError,
    finishUpload,
    canCancel,
    cancel,
  };
}
