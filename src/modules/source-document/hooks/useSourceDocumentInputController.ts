"use client";
import { useRef } from "react";
import type { ChangeEvent, ClipboardEvent } from "react";
import { toast } from "sonner";
import { fireAndForget } from "@/lib/safe-async";
import type { SourceDocumentInputProps } from "../ui/source-document-input.types";
import { buildSubmitPayload } from "./source-document-input-controller.core";
import { loadSourceDocumentInputFiles } from "./source-document-input-images";
import type { SourceDocumentInputControllerMessages } from "./source-document-input-controller.types";
import { useSourceDocumentInputDraft } from "./useSourceDocumentInputDraft";
import { useSourceDocumentSubmitMutations } from "./useSourceDocumentSubmitMutations";

interface UseSourceDocumentInputControllerOptions extends SourceDocumentInputProps {
  messages: SourceDocumentInputControllerMessages;
}

export function useSourceDocumentInputController({
  ledgerId,
  onSuccess,
  mode = "create",
  sourceDocumentId,
  initialData,
  messages,
}: UseSourceDocumentInputControllerOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draft = useSourceDocumentInputDraft({
    ...(sourceDocumentId != null ? { sourceDocumentId } : {}),
    ...(initialData != null ? { initialData } : {}),
  });
  const submitMutations = useSourceDocumentSubmitMutations({
    ledgerId,
    mode,
    messages,
    ...(onSuccess != null ? { onSuccess } : {}),
    ...(sourceDocumentId != null ? { sourceDocumentId } : {}),
  });

  const appendFiles = async (files: File[]) => {
    const results = await loadSourceDocumentInputFiles(files);

    results.forEach((result) => {
      if (result.kind === "too-large") {
        toast.error(messages.imageTooLarge(result.fileName));
        return;
      }
      if (result.kind === "unsupported") {
        toast.error(messages.imageUnsupported(result.fileName));
        return;
      }

      draft.setImages((previousImages) => [...previousImages, result.image]);
    });
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files == null) return;

    fireAndForget(appendFiles(Array.from(files)), {
      context: "SourceDocumentInput.processFiles",
    });
  };

  const handleTextareaPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files: File[] = [];

    for (const item of Array.from(event.clipboardData.items)) {
      if (!item.type.startsWith("image/")) continue;

      const file = item.getAsFile();
      if (file != null) {
        files.push(file);
      }
    }

    if (files.length === 0) return;

    fireAndForget(appendFiles(files), {
      context: "SourceDocumentInput.processFiles",
    });
  };

  const handleSubmit = () => {
    if (!draft.canSubmit) return;

    submitMutations.submit(buildSubmitPayload(draft.text, draft.images, draft.entryDate));
  };

  return {
    mode,
    text: draft.text,
    entryDate: draft.entryDate,
    images: draft.modalImages,
    selectedImageIndex: draft.selectedImageIndex,
    fileInputRef,
    isPending: draft.isInitializing || submitMutations.isPending,
    canSubmit: draft.canSubmit,
    setText: draft.setText,
    setEntryDate: draft.setEntryDate,
    openImage: draft.openImage,
    closeImage: draft.closeImage,
    removeImage: draft.removeImage,
    triggerFileDialog: () => fileInputRef.current?.click(),
    handleFileInputChange,
    handleTextareaPaste,
    handleSubmit,
  };
}
