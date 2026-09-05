"use client";

import { useEffect, useRef, useState, useTransition, type SetStateAction } from "react";
import type {
  EditableInputImage,
  SourceDocumentInputInitialData,
} from "./source-document-input-controller.types";
import {
  resolveInitialEntryDate,
  releaseEditableImage,
  toEditableImages,
  toModalImages,
} from "./source-document-input-controller.core";

interface UseSourceDocumentInputDraftOptions {
  sourceDocumentId?: string;
  initialData?: SourceDocumentInputInitialData;
  timeZone?: string;
}

interface InitialDraftSnapshot {
  text: string;
  images: EditableInputImage[];
  entryDate: number;
}

function areImagesEqual(left: EditableInputImage[], right: EditableInputImage[]) {
  return (
    left.length === right.length &&
    left.every((image, index) => {
      const other = right[index];
      return (
        other != null &&
        image.data === other.data &&
        image.mimeType === other.mimeType &&
        image.storedFileId === other.storedFileId
      );
    })
  );
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
  const [initialDraft, setInitialDraft] = useState<InitialDraftSnapshot>(() => ({
    text: initialData?.text ?? "",
    images: toEditableImages(initialData?.images),
    entryDate: entryDate.getTime(),
  }));
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const imagesRef = useRef(images);
  const [isInitializing, startTransition] = useTransition();
  const hasInitializedRef = useRef(false);
  const previousSourceDocumentIdRef = useRef<string | undefined>(sourceDocumentId);
  const resetDraft = () => {
    const nextEntryDate = resolveInitialEntryDate(undefined, timeZone);
    setText("");
    replaceImages([]);
    setEntryDate(nextEntryDate);
    setInitialDraft({ text: "", images: [], entryDate: nextEntryDate.getTime() });
    setSelectedImageIndex(null);
  };

  const replaceImages = (update: SetStateAction<EditableInputImage[]>) => {
    setImages((current) => {
      const next = typeof update === "function" ? update(current) : update;
      for (const image of current) {
        if (!next.includes(image)) releaseEditableImage(image);
      }
      return next;
    });
  };

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(
    () => () => {
      imagesRef.current.forEach(releaseEditableImage);
    },
    []
  );

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
      const nextText = initialData.text ?? "";
      const nextImages = toEditableImages(initialData.images);
      const nextEntryDate = resolveInitialEntryDate(initialData.entryDate, timeZone);
      setInitialDraft({
        text: nextText,
        images: nextImages,
        entryDate: nextEntryDate.getTime(),
      });
      setText(nextText);
      replaceImages(nextImages);
      setEntryDate(nextEntryDate);
    });
  }, [initialData, startTransition, timeZone]);

  return {
    text,
    setText,
    images,
    setImages: replaceImages,
    modalImages: toModalImages(images),
    entryDate,
    setEntryDate,
    selectedImageIndex,
    openImage: (index: number) => setSelectedImageIndex(index),
    closeImage: () => setSelectedImageIndex(null),
    removeImage: (index: number) =>
      replaceImages((previousImages) =>
        previousImages.filter((_, imageIndex) => imageIndex !== index)
      ),
    canSubmit: text !== "" || images.length > 0,
    isDirty:
      text !== initialDraft.text ||
      !areImagesEqual(images, initialDraft.images) ||
      entryDate.getTime() !== initialDraft.entryDate,
    isInitializing,
    resetDraft,
  };
}
