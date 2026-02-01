"use client";

import Image from "next/image";
import { useState, useRef, useEffect, useTransition } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { updateLedgerAction, getLedgerAction } from "@/features/ledger/server/actions/ledgers";
import { createSourceDocumentAction, retrySourceDocumentAction } from "@/features/source-document/server/actions/main";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Send, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";

import { Ledger } from "@/types/api";

import { useTranslations } from "next-intl";
import { compressImage } from "@/lib/image-utils";

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
    const tSettings = useTranslations("Settings");
    const tCommon = useTranslations("Common");
    const queryClient = useQueryClient();
    const [text, setText] = useState(initialData?.text || "");
    const [images, setImages] = useState<{ data: string; mimeType: string }[]>(initialData?.images || []);
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [isTransitionPending, startTransition] = useTransition();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reset state when initialData changes (for retry mode)
    useEffect(() => {
        if (initialData) {
            setText(initialData.text || "");
            setImages(initialData.images || []);
        }
    }, [initialData]);

    const { data: ledger } = useQuery({
        queryKey: ["ledger", ledgerId],
        queryFn: () => getLedgerAction(ledgerId),
    });

    const updateLedgerMutation = useMutation({
        mutationFn: async (data: Partial<Ledger>) => {
            const result = await updateLedgerAction(ledgerId, {
                ...data,
                currencies: data.currencies || undefined,
                mainCurrency: data.mainCurrency || undefined,
                autoRecognizeDate: data.autoRecognizeDate === null ? undefined : data.autoRecognizeDate,
                collapseProcessingDefault: data.collapseProcessingDefault === null ? undefined : data.collapseProcessingDefault,
                mergeSimilarItems: data.mergeSimilarItems === null ? undefined : data.mergeSimilarItems,
                collapseBillsDefault: data.collapseBillsDefault === null ? undefined : data.collapseBillsDefault,
                aiCustomPrompt: data.aiCustomPrompt === null ? undefined : data.aiCustomPrompt,
            });
            if (!result.success) throw new Error(result.error || "Unknown error");
            return result.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ledger", ledgerId] });
        },
    });

    const sendMutation = useMutation({
        mutationFn: async (data: {
            text?: string;
            images?: { data: string; mimeType: string }[];
        }) => {
            const result = await createSourceDocumentAction(ledgerId, data);
            if (!result.success) throw new Error(result.error || "Unknown error");
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sourceDocuments", ledgerId] });
            setText("");
            setImages([]);
            onSuccess?.();
        },
    });

    const retryMutation = useMutation({
        mutationFn: async (data: {
            text?: string;
            images?: { data: string; mimeType: string }[];
        }) => {
            const result = await retrySourceDocumentAction(ledgerId, sourceDocumentId!, data);
            if (!result.success) throw new Error(result.error || "Unknown error");
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sourceDocuments", ledgerId] });
            onSuccess?.();
        },
    });

    const handleSend = () => {
        if (!text && images.length === 0) return;
        const payload = {
            text: text || undefined,
            images: images.length > 0 ? images : undefined,
        };
        startTransition(() => {
            if (mode === "retry") {
                retryMutation.mutate(payload);
            } else {
                sendMutation.mutate(payload);
            }
        });
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
                    setImages((prev) => [...prev, { data: base64, mimeType: file.type }]);
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
                            <div className="aspect-square relative w-full overflow-hidden rounded-md border border-border">
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

            {/* Advanced Features Fold */}
            <div className="border border-border rounded-lg overflow-hidden">
                <button
                    onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-surface hover:bg-surface/80 transition-colors text-sm font-medium"
                >
                    <span className="flex items-center gap-2">
                        {t("advancedFeatures")}
                    </span>
                    {isAdvancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {isAdvancedOpen && (
                    <div className="p-3 space-y-4 bg-surface/30 border-t border-border animate-in slide-in-from-top-1 duration-200">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <div className="text-sm font-medium">{tSettings("autoRecognizeDate")}</div>
                                <div className="text-xs text-muted-foreground leading-tight">{tSettings("autoRecognizeDateDesc")}</div>
                            </div>
                            <Switch
                                checked={ledger?.autoRecognizeDate || false}
                                onCheckedChange={(checked) => {
                                    updateLedgerMutation.mutate({ autoRecognizeDate: checked });
                                }}
                            />
                        </div>

                        <div className="h-px bg-border" />

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <div className="text-sm font-medium">{tSettings("mergeSimilar")}</div>
                                <div className="text-xs text-muted-foreground leading-tight">{tSettings("mergeSimilarDesc")}</div>
                            </div>
                            <Switch
                                checked={ledger?.mergeSimilarItems || false}
                                onCheckedChange={(checked) => {
                                    updateLedgerMutation.mutate({ mergeSimilarItems: checked });
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>

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
        </div>
    );
}
