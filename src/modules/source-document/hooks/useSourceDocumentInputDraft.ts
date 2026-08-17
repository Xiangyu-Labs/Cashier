"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type {
  EditableInputImage,
  SourceDocumentInputInitialData,
} from "./source-document-input-controller.types";
import {
  resolveInitialEntryDate,
  toEditableImages,
  toModalImages,
} from "./source-document-input-controller.core";

interface UseSourceDocumentInputDraftOptions {
  sourceDocumentId?: string;
  initialData?: SourceDocumentInputInitialData;
  timeZone?: string;
}

export function useSourceDocumentInputDraft({
  sourceDocumentId,
  initialData,
  timeZone,
}: UseSourceDocumentInputDraftOptions) {
  const [text, setText] = useState(initialData?.text ?? "");
  const [images, setImages] = useState<EditableInputImage[]>(() =>
    toEditableImages(initialData?.images)
  );
  const [entryDate, setEntryDate] = useState<Date>(() =>
    resolveInitialEntryDate(initialData?.entryDate, timeZone)
  );
  const [initialEntryDate, setInitialEntryDate] = useState(() => entryDate.getTime());
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isInitializing, startTransition] = useTransition();
  const hasInitializedRef = useRef(false);
  const previousSourceDocumentIdRef = useRef<string | undefined>(sourceDocumentId);
  const resetDraft = () => {
    const nextEntryDate = resolveInitialEntryDate(undefined, timeZone);
    setText("");
    setImages([]);
    setEntryDate(nextEntryDate);
    setInitialEntryDate(nextEntryDate.getTime());
    setSelectedImageIndex(null);
  };

  useEffect(() => {
    if (previousSourceDocumentIdRef.current !== sourceDocumentId) {
      hasInitializedRef.current = false;
      previousSourceDocumentIdRef.current = sourceDocumentId;
    }
  }, [sourceDocumentId]);

  useEffect(() => {
    if (initialData == null || hasInitializedRef.current) return;

    hasInitializedRef.current = true;
    startTransition(() => {
      setText(initialData.text ?? "");
      setImages(toEditableImages(initialData.images));
      const nextEntryDate = resolveInitialEntryDate(initialData.entryDate, timeZone);
      setInitialEntryDate(nextEntryDate.getTime());
      setEntryDate(nextEntryDate);
    });
  }, [initialData, startTransition, timeZone]);

  return {
    text,
    setText,
    images,
    setImages,
    modalImages: toModalImages(images),
    entryDate,
    setEntryDate,
    selectedImageIndex,
    openImage: (index: number) => setSelectedImageIndex(index),
    closeImage: () => setSelectedImageIndex(null),
    removeImage: (index: number) =>
      setImages((previousImages) => previousImages.filter((_, imageIndex) => imageIndex !== index)),
    canSubmit: text !== "" || images.length > 0,
    isDirty: text !== "" || images.length > 0 || entryDate.getTime() !== initialEntryDate,
    isInitializing,
    resetDraft,
  };
}
