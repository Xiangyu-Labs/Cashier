"use client";

import Image from "next/image";
import { useState, useRef, useEffect, useTransition } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { updateLedgerAction, getLedgerAction } from "@/modules/ledger/actions";
import {
  invalidateLedger,
  invalidateSourceDocuments,
  invalidateTaskQueue,
  queryKeys,
} from "@/lib/query-keys";
import {
  createSourceDocumentAction,
  retrySourceDocumentAction,
} from "@/modules/source-document/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Send, RefreshCw } from "lucide-react";
import { type Ledger, type SourceDocument } from "@/types/api";
import { toast } from "sonner";

import { useTranslations } from "next-intl";
import { compressImage } from "@/lib/image-utils";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { fireAndForget } from "@/lib/safe-async";
import {
  SourceDocumentImageModal,
  type SourceDocumentModalImage,
} from "./SourceDocumentImageModal";

interface EditableInputImage extends SourceDocumentModalImage {
  originalData: string;
  originalMimeType: string;
  isEdited: boolean;
}

interface SourceDocumentInputProps {
  ledgerId: string;
  onSuccess?: () => void;
  mode?: "create" | "retry";
  sourceDocumentId?: string;
  initialData?: {
    text?: string;
    images?: { data: string; mimeType: string }[];
  };
}

export function SourceDocumentInput({
  ledgerId,
  onSuccess,
  mode = "create",
  sourceDocumentId,
  initialData,
}: SourceDocumentInputProps) {
  const t = useTranslations("SourceDocumentInput");
  const tCommon = useTranslations("Common");
  const queryClient = useQueryClient();
  const [text, setText] = useState(initialData?.text ?? "");
  const [images, setImages] = useState<EditableInputImage[]>(
    (initialData?.images ?? []).map((image) => ({
      ...image,
      originalData: image.data,
      originalMimeType: image.mimeType,
      isEdited: false,
    }))
  );
  const [_isAdvancedOpen, _setIsAdvancedOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isTransitionPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasInitializedRef = useRef(false);
  const prevSourceDocumentIdRef = useRef<string | undefined>(sourceDocumentId);

  // Reset initialization flag when sourceDocumentId changes (different document)
  useEffect(() => {
    if (prevSourceDocumentIdRef.current !== sourceDocumentId) {
      hasInitializedRef.current = false;
      prevSourceDocumentIdRef.current = sourceDocumentId;
    }
  }, [sourceDocumentId]);

  // Only set initial data once per document, not when initialData changes
  // This prevents user's editing from being reset when background task status changes
  useEffect(() => {
    const hasInitialData = initialData !== undefined && initialData !== null;
    if (hasInitialData && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      startTransition(() => {
        setText(initialData.text ?? "");
        setImages(
          (initialData.images ?? []).map((image) => ({
            ...image,
            originalData: image.data,
            originalMimeType: image.mimeType,
            isEdited: false,
          }))
        );
      });
    }
  }, [initialData]);

  const { data: _ledger } = useQuery({
    queryKey: queryKeys.ledger(ledgerId),
    queryFn: () => getLedgerAction(ledgerId),
  });

  const _updateLedgerMutation = useMutation({
    mutationFn: async (
      data: Partial<Ledger> & { name?: string; settings?: Record<string, unknown> }
    ) => {
      const settingsUpdate: Record<string, unknown> = data.settings || {};

      const payload: Partial<Ledger> & { settings?: Record<string, unknown> } = {
        ...(Object.keys(settingsUpdate).length > 0 ? { settings: settingsUpdate } : {}),
      };

      return await updateLedgerAction(ledgerId, payload);
    },
    onMutate: async (data) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: queryKeys.ledger(ledgerId) });

      // Snapshot previous data
      const previousLedger = queryClient.getQueryData(queryKeys.ledger(ledgerId));

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.ledger(ledgerId), (old: Ledger | undefined) => {
        if (!old) return old;
        return {
          ...old,
          ...data,
          ...(data.settings && {
            metadata: {
              ...old.metadata,
              settings: {
                ...old.metadata?.settings,
                ...data.settings,
              },
            },
          }),
        };
      });

      return { previousLedger };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context !== undefined && context.previousLedger !== undefined) {
        queryClient.setQueryData(queryKeys.ledger(ledgerId), context.previousLedger);
      }
    },
    onSettled: () => {
      fireAndForget(
        queryClient.invalidateQueries({ predicate: invalidateLedger(ledgerId) }),
        { context: "SourceDocumentInput" }
      );
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (data: {
      text?: string;
      images?: { data: string; mimeType: string }[];
      originalImages?: { data: string; mimeType: string }[];
    }) => {
      return await createSourceDocumentAction(ledgerId, data);
    },
    onMutate: async (_newData) => {
      // Cancel any outgoing refetches to prevent race conditions
      await queryClient.cancelQueries({ queryKey: queryKeys.sourceDocuments(ledgerId, "pending") });

      // Snapshot the previous pending documents for rollback
      const previousPending = queryClient.getQueryData(
        queryKeys.sourceDocuments(ledgerId, "pending")
      );

      // Store the current input values for potential rollback
      const previousText = text;
      const previousImages = [...images];

      // Immediately clear the input (feels instant!)
      setText("");
      setImages([]);

      return { previousPending, previousText, previousImages };
    },
    onError: (
      _err,
      _newData,
      context:
        | {
            previousPending?: unknown;
            previousText?: string;
            previousImages?: EditableInputImage[];
          }
        | undefined
    ) => {
      // Rollback: restore the pending documents cache
      if (context !== undefined && context.previousPending !== undefined) {
        queryClient.setQueryData(
          queryKeys.sourceDocuments(ledgerId, "pending"),
          context.previousPending
        );
      }
      // Restore the input values so user doesn't lose their data
      if (context !== undefined && context.previousText !== undefined) {
        setText(context.previousText);
      }
      if (context !== undefined && context.previousImages !== undefined) {
        setImages(context.previousImages);
      }
      toast.error(t("uploadError"));
    },
    onSuccess: () => {
      // Dialog already closed optimistically, just show success toast
      toast.success(t("uploadSuccess"));
    },
    onSettled: () => {
      // Always refetch to ensure server state is in sync
      fireAndForget(
        queryClient.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) }),
        { context: "SourceDocumentInput" }
      );
      // Also invalidate task queue to trigger smart polling for the new parse task
      fireAndForget(
        queryClient.invalidateQueries({ predicate: invalidateTaskQueue(ledgerId) }),
        { context: "SourceDocumentInput" }
      );
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (data: {
      text?: string;
      images?: { data: string; mimeType: string }[];
      originalImages?: { data: string; mimeType: string }[];
    }) => {
      await retrySourceDocumentAction(ledgerId, sourceDocumentId!, data);
    },
    onMutate: async (data) => {
      // Cancel any outgoing refetches
      await Promise.all([
        queryClient.cancelQueries({ predicate: invalidateSourceDocuments(ledgerId) }),
        queryClient.cancelQueries({ predicate: invalidateTaskQueue(ledgerId) }),
      ]);

      // Snapshot previous data
      const previousDocument = sourceDocumentId !== undefined
        ? queryClient.getQueryData(queryKeys.sourceDocument(sourceDocumentId))
        : undefined;

      // Optimistically update document status to "processing"
      if (sourceDocumentId !== undefined) {
        queryClient.setQueryData(
          queryKeys.sourceDocument(sourceDocumentId),
          (old: SourceDocument | undefined) => {
            if (!old) return old;
            const textValue = data.text;
            return {
              ...old,
              status: "processing",
              ...(textValue !== undefined && textValue !== null && textValue !== "" ? { text: textValue } : {}),
            };
          }
        );
      }

      return { previousDocument };
    },
    onSuccess: () => {
      // Dialog already closed optimistically, just show success toast
      toast.success(t("retrySuccess"));
    },
    onError: (_err, _vars, context: { previousDocument?: unknown } | undefined) => {
      // Rollback on error
      if (context !== undefined && context.previousDocument !== undefined && sourceDocumentId !== undefined) {
        queryClient.setQueryData(
          queryKeys.sourceDocument(sourceDocumentId),
          context.previousDocument
        );
      }
      toast.error(t("retryError"));
    },
    onSettled: () => {
      fireAndForget(
        queryClient.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) }),
        { context: "SourceDocumentInput" }
      );
      // Also invalidate task queue to trigger smart polling for the retry task
      fireAndForget(
        queryClient.invalidateQueries({ predicate: invalidateTaskQueue(ledgerId) }),
        { context: "SourceDocumentInput" }
      );
    },
  });

  const handleSend = () => {
    if (text === "" && images.length === 0) return;
    const textValue = text;
    const hasText = textValue.length > 0;
    const textPayload: string | undefined = hasText ? textValue : undefined;
    const nextCurrentImages = images.map(({ data, mimeType }) => ({ data, mimeType }));
    const nextOriginalImages = images.map(({ originalData, originalMimeType }) => ({
      data: originalData,
      mimeType: originalMimeType,
    }));
    const payload = {
      entryDate: formatDateTimeForApi(new Date()),
      ...(textPayload !== undefined ? { text: textPayload } : {}),
      ...(nextCurrentImages.length > 0 ? { images: nextCurrentImages } : {}),
      ...(images.some((image) => image.isEdited) ? { originalImages: nextOriginalImages } : {}),
    };
    // Optimistic update: close dialog immediately, then start mutation
    onSuccess?.();
    if (mode === "retry") {
      startTransition(() => {
        retryMutation.mutate(payload);
      });
    } else {
      startTransition(() => {
        sendMutation.mutate(payload);
      });
    }
  };

  const isPending =
    (mode === "retry" ? retryMutation.isPending : sendMutation.isPending) ?? isTransitionPending;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    fireAndForget(processFiles(Array.from(files)), { context: "SourceDocumentInput.processFiles" });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) fireAndForget(processFiles(files), { context: "SourceDocumentInput.processFiles" });
  };

  const MAX_FALLBACK_SIZE = 5 * 1024 * 1024; // 5MB

  const processFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        setImages((prev) => [
          ...prev,
          {
            ...compressed,
            originalData: compressed.data,
            originalMimeType: compressed.mimeType,
            isEdited: false,
          },
        ]);
      } catch (error) {
        console.error("Failed to compress image:", error);

        // Only use original if under size limit
        if (file.size <= MAX_FALLBACK_SIZE) {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            // Extract correct mime type from the data URL (browser determines this from file content)
            const mimeMatch = base64.match(/^data:([^;]+);base64,/);
            const mimeType = mimeMatch?.[1] ?? (file.type !== "" ? file.type : "image/jpeg");
            setImages((prev) => [
              ...prev,
              {
                data: base64,
                mimeType,
                originalData: base64,
                originalMimeType: mimeType,
                isEdited: false,
              },
            ]);
          };
          reader.readAsDataURL(file);
        } else {
          toast.error(`Image too large: ${file.name}. Please use a smaller image.`);
        }
      }
    }
  };

  const currentImages = images.map(({ data, mimeType }) => ({ data, mimeType }));

  const imageActionButtonClassName =
    "absolute z-10 flex h-6 w-6 items-center justify-center rounded-full text-white transition-opacity opacity-100 [@media(any-hover:hover)]:opacity-0 [@media(any-hover:hover)]:group-hover:opacity-100";

  return (
    <div className="space-y-4">
      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <div
                className="aspect-square relative w-full overflow-hidden rounded-md border border-border cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setSelectedImageIndex(idx)}
              >
                <Image src={img.data} alt={`Uploaded ${idx + 1}`} fill className="object-cover" />
              </div>

              {/* Action buttons stay visible on touch devices and collapse to hover on desktops */}
              <button
                onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                type="button"
                aria-label={tCommon("delete")}
                title={tCommon("delete")}
                className={`${imageActionButtonClassName} right-1 top-1 bg-danger text-xs`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={handlePaste}
        placeholder={t("placeholder")}
        className="resize-none"
        rows={5}
        autoFocus
      />

      <div className="flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          multiple
          className="hidden"
        />
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Camera className="h-4 w-4 mr-2" /> {t("image")}
        </Button>
        <div className="flex-1" />
        <Button
          onClick={handleSend}
          disabled={isPending || (text === "" && images.length === 0)}
          className="flex-1 sm:flex-initial"
        >
          {isPending ? (
            tCommon("sending_status")
          ) : (
            <>
              {mode === "retry" ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {tCommon("retry")}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  {t("send")}
                </>
              )}
            </>
          )}
        </Button>
      </div>

      <SourceDocumentImageModal
        images={currentImages}
        initialIndex={selectedImageIndex ?? 0}
        open={selectedImageIndex !== null}
        editable
        onOpenChange={(open) => !open && setSelectedImageIndex(null)}
        onSave={(updatedImages) => {
          setImages((prev) =>
            prev.map((image, index) => {
              const updatedImage = updatedImages[index];
              if (updatedImage == null) return image;

              return {
                ...image,
                data: updatedImage.data,
                mimeType: updatedImage.mimeType,
                isEdited:
                  updatedImage.data !== image.originalData ||
                  updatedImage.mimeType !== image.originalMimeType,
              };
            })
          );
        }}
      />
    </div>
  );
}
