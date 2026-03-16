"use client";

import Image from "next/image";
import { useState, useRef, useEffect, useTransition } from "react";
import { ImageViewer } from "@/components/ui/image-viewer";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { updateLedgerAction } from "@/features/ledger/server/actions/update";
import { getLedgerAction } from "@/features/ledger/server/actions/get";
import { queryKeys, invalidateLedgerCache } from "@/lib/query-keys";
import { createSourceDocumentAction, retrySourceDocumentAction } from "@/features/source-document/server/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Send, RefreshCw } from "lucide-react";
import { Ledger, SourceDocument } from "@/types/api";
import { toast } from "sonner";

import { useTranslations } from "next-intl";
import { compressImage } from "@/lib/image-utils";
import { formatDateTimeForApi } from "@/lib/date-utils";

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

export function SourceDocumentInput({ ledgerId, onSuccess, mode = "create", sourceDocumentId, initialData }: SourceDocumentInputProps) {
    const t = useTranslations("SourceDocumentInput");
    const tCommon = useTranslations("Common");
    const queryClient = useQueryClient();
    const [text, setText] = useState(initialData?.text || "");
    const [images, setImages] = useState<{ data: string; mimeType: string }[]>(initialData?.images || []);
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
        if (initialData && !hasInitializedRef.current) {
            hasInitializedRef.current = true;
            startTransition(() => {
                setText(initialData.text || "");
                setImages(initialData.images || []);
            });
        }
    }, [initialData]);

    const { data: _ledger } = useQuery({
        queryKey: queryKeys.ledger(ledgerId),
        queryFn: () => getLedgerAction(ledgerId),
    });

    const _updateLedgerMutation = useMutation({
        mutationFn: async (data: Partial<Ledger> & { name?: string; settings?: Record<string, unknown> }) => {
            const settingsUpdate: Record<string, unknown> = data.settings || {};

            const payload: Partial<Ledger> & { settings?: Record<string, unknown> } = {
                name: data.name,
                settings: Object.keys(settingsUpdate).length > 0 ? settingsUpdate : undefined
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
                            }
                        }
                    })
                };
            });

            return { previousLedger };
        },
        onError: (_err, _vars, context) => {
            // Rollback on error
            if (context?.previousLedger) {
                queryClient.setQueryData(queryKeys.ledger(ledgerId), context.previousLedger);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        },
    });

    const sendMutation = useMutation({
        mutationFn: async (data: {
            text?: string;
            images?: { data: string; mimeType: string }[];
        }) => {
            return await createSourceDocumentAction(ledgerId, data);
        },
        onMutate: async (_newData) => {
            // Cancel any outgoing refetches to prevent race conditions
            await queryClient.cancelQueries({ queryKey: queryKeys.sourceDocuments(ledgerId, 'pending') });

            // Snapshot the previous pending documents for rollback
            const previousPending = queryClient.getQueryData(queryKeys.sourceDocuments(ledgerId, 'pending'));

            // Store the current input values for potential rollback
            const previousText = text;
            const previousImages = [...images];

            // Immediately clear the input (feels instant!)
            setText("");
            setImages([]);

            return { previousPending, previousText, previousImages };
        },
        onError: (_err, _newData, context) => {
            // Rollback: restore the pending documents cache
            if (context?.previousPending !== undefined) {
                queryClient.setQueryData(
                    queryKeys.sourceDocuments(ledgerId, 'pending'),
                    context.previousPending
                );
            }
            // Restore the input values so user doesn't lose their data
            if (context?.previousText !== undefined) {
                setText(context.previousText);
            }
            if (context?.previousImages !== undefined) {
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
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
            // Also invalidate task queue to trigger smart polling for the new parse task
            queryClient.invalidateQueries({ queryKey: queryKeys.taskQueue(ledgerId) });
        },
    });

    const retryMutation = useMutation({
        mutationFn: async (data: {
            text?: string;
            images?: { data: string; mimeType: string }[];
        }) => {
            await retrySourceDocumentAction(ledgerId, sourceDocumentId!, data);
        },
        onMutate: async (data) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot previous data
            const previousDocument = sourceDocumentId
                ? queryClient.getQueryData(queryKeys.sourceDocument(sourceDocumentId))
                : undefined;

            // Optimistically update document status to "processing"
            if (sourceDocumentId) {
                queryClient.setQueryData(queryKeys.sourceDocument(sourceDocumentId), (old: SourceDocument | undefined) => {
                    if (!old) return old;
                    return {
                        ...old,
                        status: 'processing',
                        ...(data.text && { text: data.text }),
                    };
                });
            }

            return { previousDocument };
        },
        onSuccess: () => {
            // Dialog already closed optimistically, just show success toast
            toast.success(t("retrySuccess"));
        },
        onError: (_err, _vars, context) => {
            // Rollback on error
            if (context?.previousDocument && sourceDocumentId) {
                queryClient.setQueryData(queryKeys.sourceDocument(sourceDocumentId), context.previousDocument);
            }
            toast.error(t("retryError"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
            // Also invalidate task queue to trigger smart polling for the retry task
            queryClient.invalidateQueries({ queryKey: queryKeys.taskQueue(ledgerId) });
        },
    });

    const handleSend = () => {
        if (!text && images.length === 0) return;
        const payload = {
            text: text || undefined,
            images: images.length > 0 ? images : undefined,
            entryDate: formatDateTimeForApi(new Date()),
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

    const isPending = (mode === "retry" ? retryMutation.isPending : sendMutation.isPending) || isTransitionPending;

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        processFiles(Array.from(files));
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = e.clipboardData.items;
        const files: File[] = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith("image/")) {
                const file = items[i].getAsFile();
                if (file) files.push(file);
            }
        }
        if (files.length > 0) processFiles(files);
    };



    const processFiles = async (files: File[]) => {
        for (const file of files) {
            try {
                const compressed = await compressImage(file);
                setImages((prev) => [...prev, compressed]);
            } catch (error) {
                console.error("Failed to compress image:", error);
                // Fallback to original image if compression fails
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = reader.result as string;
                    // Extract correct mime type from the data URL (browser determines this from file content)
                    const mimeMatch = base64.match(/^data:([^;]+);base64,/);
                    const mimeType = mimeMatch ? mimeMatch[1] : file.type;
                    setImages((prev) => [...prev, { data: base64, mimeType }]);
                };
                reader.readAsDataURL(file);
            }
        }
    };

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
                                <Image
                                    src={img.data}
                                    alt={`Uploaded ${idx + 1}`}
                                    fill
                                    className="object-cover"
                                />
                            </div>
                            <button
                                onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                                className="absolute -top-2 -right-2 w-5 h-5 bg-danger text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <Camera className="h-4 w-4 mr-2" /> {t("image")}
                </Button>
                <div className="flex-1" />
                <Button
                    onClick={handleSend}
                    disabled={isPending || (!text && images.length === 0)}
                    className="flex-1 sm:flex-initial"
                >
                    {isPending ? tCommon("sending_status") : (
                        <>
                            {mode === "retry" ? (
                                <><RefreshCw className="h-4 w-4 mr-2" />{tCommon("retry")}</>
                            ) : (
                                <><Send className="h-4 w-4 mr-2" />{t("send")}</>
                            )}
                        </>
                    )}
                </Button>
            </div>

            <ImageViewer
                images={images.map(img => img.data)}
                initialIndex={selectedImageIndex ?? 0}
                open={selectedImageIndex !== null}
                onOpenChange={(open) => !open && setSelectedImageIndex(null)}
            />
        </div>
    );
}
