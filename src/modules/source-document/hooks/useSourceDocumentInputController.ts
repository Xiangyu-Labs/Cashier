"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ChangeEvent, ClipboardEvent } from "react";
import { toast } from "sonner";
import { fireAndForget } from "@/lib/safe-async";
import type { SourceDocumentModalImage } from "../ui/SourceDocumentImageModal";
import type { SourceDocumentInputProps } from "../ui/source-document-input.types";
import {
  buildSubmitPayload,
  mergeModalImagesIntoEditableImages,
  resolveInitialEntryDate,
  toEditableImages,
  toModalImages,
} from "./source-document-input-controller.core";
import { loadSourceDocumentInputFiles } from "./source-document-input-images";
import type {
  EditableInputImage,
  SourceDocumentInputControllerMessages,
} from "./source-document-input-controller.types";
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
  const [text, setText] = useState(initialData?.text ?? "");
  const [images, setImages] = useState<EditableInputImage[]>(toEditableImages(initialData?.images));
  const [entryDate, setEntryDate] = useState<Date>(() =>
    resolveInitialEntryDate(initialData?.entryDate)
  );
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isTransitionPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasInitializedRef = useRef(false);
  const prevSourceDocumentIdRef = useRef<string | undefined>(sourceDocumentId);
  const submitMutations = useSourceDocumentSubmitMutations({
    ledgerId,
    mode,
    sourceDocumentId,
    messages,
  });

  useEffect(() => {
    if (prevSourceDocumentIdRef.current !== sourceDocumentId) {
      hasInitializedRef.current = false;
      prevSourceDocumentIdRef.current = sourceDocumentId;
    }
  }, [sourceDocumentId]);

  useEffect(() => {
    if (initialData == null || hasInitializedRef.current) return;

    hasInitializedRef.current = true;
    startTransition(() => {
      setText(initialData.text ?? "");
      setImages(toEditableImages(initialData.images));
      setEntryDate(resolveInitialEntryDate(initialData.entryDate));
    });
  }, [initialData, startTransition]);

  const canSubmit = text !== "" || images.length > 0;
  const currentImages = toModalImages(images);
  const isPending = submitMutations.isPending || isTransitionPending;

  const appendFiles = async (files: File[]) => {
    const results = await loadSourceDocumentInputFiles(files);

    results.forEach((result) => {
      if (result.kind === "too-large") {
        toast.error(messages.imageTooLarge(result.fileName));
        return;
      }

      setImages((previousImages) => [...previousImages, result.image]);
    });
  };

  const handleSubmit = () => {
    if (!canSubmit) return;

    const payload = buildSubmitPayload(text, images, entryDate);
    const submitted = submitMutations.submit(payload);
    if (submitted) {
      onSuccess?.();
    }
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

  const handleModalSave = (updatedImages: SourceDocumentModalImage[]) => {
    setImages((previousImages) => mergeModalImagesIntoEditableImages(previousImages, updatedImages));
  };

  return {
    mode,
    text,
    entryDate,
    images: currentImages,
    selectedImageIndex,
    fileInputRef,
    isPending,
    canSubmit,
    setText,
    setEntryDate,
    openImage: (index: number) => setSelectedImageIndex(index),
    closeImage: () => setSelectedImageIndex(null),
    removeImage: (index: number) => {
      setImages((previousImages) => previousImages.filter((_, imageIndex) => imageIndex !== index));
    },
    triggerFileDialog: () => fileInputRef.current?.click(),
    handleFileInputChange,
    handleTextareaPaste,
    handleSubmit,
    handleModalSave,
  };
}
