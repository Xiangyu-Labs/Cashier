"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ChangeEvent, ClipboardEvent } from "react";
import { toast } from "sonner";
import { invalidateSourceDocuments, invalidateTaskQueue, queryKeys } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  createSourceDocumentAction,
  retrySourceDocumentAction,
} from "@/modules/source-document/actions";
import { compressImage } from "@/lib/image-utils";
import { fireAndForget } from "@/lib/safe-async";
import type { SourceDocument } from "@/modules/source-document/contracts";
import type { SourceDocumentModalImage } from "../ui/SourceDocumentImageModal";
import type { SourceDocumentInputProps } from "../ui/source-document-input.types";
import {
  buildSubmitPayload,
  mergeModalImagesIntoEditableImages,
  resolveInitialEntryDate,
  toEditableImage,
  toEditableImages,
  toModalImages,
} from "./source-document-input-controller.core";
import type {
  EditableInputImage,
  SourceDocumentInputControllerMessages,
  SourceDocumentSubmitPayload,
} from "./source-document-input-controller.types";

const MAX_FALLBACK_SIZE = 5 * 1024 * 1024;

type QueryPredicate = (query: { queryKey: readonly unknown[] }) => boolean;

interface CreateRollbackContext {
  previousPending?: unknown;
}

interface RetryRollbackContext {
  previousDocument?: unknown;
}

interface UseSourceDocumentInputControllerOptions extends SourceDocumentInputProps {
  messages: SourceDocumentInputControllerMessages;
}

function createExactPredicate(target: readonly unknown[]): QueryPredicate {
  return (query) =>
    Array.isArray(query.queryKey) &&
    query.queryKey.length === target.length &&
    target.every((value, index) => query.queryKey[index] === value);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unexpected FileReader result"));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file"));
    };

    reader.readAsDataURL(file);
  });
}

function invalidateSubmitQueries(
  queryClient: {
    invalidateQueries: (options: { predicate: QueryPredicate }) => Promise<unknown>;
  },
  ledgerId: string
) {
  fireAndForget(queryClient.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) }), {
    context: "SourceDocumentInput",
  });
  fireAndForget(queryClient.invalidateQueries({ predicate: invalidateTaskQueue(ledgerId) }), {
    context: "SourceDocumentInput",
  });
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

  const createMutation = useLedgerMutation<
    unknown,
    SourceDocumentSubmitPayload,
    CreateRollbackContext
  >(
    ledgerId,
    {
      mutationFn: async (payload) => createSourceDocumentAction(ledgerId, payload),
      successMessage: messages.uploadSuccess,
      errorMessage: messages.uploadError,
      cancelPredicates: [createExactPredicate(queryKeys.sourceDocuments(ledgerId, "pending"))],
      skipInvalidation: true,
      onOptimisticUpdate: async (queryClient) => {
        const previousPending = queryClient.getQueryData(
          queryKeys.sourceDocuments(ledgerId, "pending")
        );

        return { previousPending };
      },
      onRollback: (queryClient, context) => {
        if (context.previousPending !== undefined) {
          queryClient.setQueryData(
            queryKeys.sourceDocuments(ledgerId, "pending"),
            context.previousPending
          );
        }
      },
      onSettledExtra: (queryClient) => {
        invalidateSubmitQueries(queryClient, ledgerId);
      },
    }
  );

  const retryMutation = useLedgerMutation<
    unknown,
    SourceDocumentSubmitPayload,
    RetryRollbackContext
  >(ledgerId, {
    mutationFn: async (payload) => {
      if (sourceDocumentId == null) return;
      await retrySourceDocumentAction(ledgerId, sourceDocumentId, payload);
    },
    successMessage: messages.retrySuccess,
    errorMessage: messages.retryError,
    cancelPredicates: [invalidateSourceDocuments(ledgerId), invalidateTaskQueue(ledgerId)],
    skipInvalidation: true,
    onOptimisticUpdate: async (queryClient, payload) => {
      const previousDocument =
        sourceDocumentId != null
          ? queryClient.getQueryData(queryKeys.sourceDocument(sourceDocumentId))
          : undefined;

      if (sourceDocumentId != null) {
        queryClient.setQueryData(
          queryKeys.sourceDocument(sourceDocumentId),
          (current: SourceDocument | undefined) => {
            if (current == null) return current;

            return {
              ...current,
              status: "processing",
              ...(payload.text !== undefined && payload.text !== "" ? { text: payload.text } : {}),
            };
          }
        );
      }

      return { previousDocument };
    },
    onRollback: (queryClient, context) => {
      if (sourceDocumentId == null || context.previousDocument === undefined) return;

      queryClient.setQueryData(
        queryKeys.sourceDocument(sourceDocumentId),
        context.previousDocument
      );
    },
    onSettledExtra: (queryClient) => {
      invalidateSubmitQueries(queryClient, ledgerId);
    },
  });

  const canSubmit = text !== "" || images.length > 0;
  const currentImages = toModalImages(images);
  const activeMutation = mode === "retry" ? retryMutation : createMutation;
  const isPending = activeMutation.isPending || isTransitionPending;

  const appendFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        setImages((previousImages) => [...previousImages, toEditableImage(compressed)]);
      } catch (error) {
        console.error("Failed to compress image:", error);

        if (file.size > MAX_FALLBACK_SIZE) {
          toast.error(messages.imageTooLarge(file.name));
          continue;
        }

        const base64 = await readFileAsDataUrl(file);
        const mimeMatch = base64.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch?.[1] ?? (file.type !== "" ? file.type : "image/jpeg");

        setImages((previousImages) => [
          ...previousImages,
          toEditableImage({
            data: base64,
            mimeType,
          }),
        ]);
      }
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (mode === "retry" && sourceDocumentId == null) return;

    const payload = buildSubmitPayload(text, images, entryDate);
    onSuccess?.();

    startTransition(() => {
      if (mode === "retry") {
        retryMutation.mutate(payload);
        return;
      }

      createMutation.mutate(payload);
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
