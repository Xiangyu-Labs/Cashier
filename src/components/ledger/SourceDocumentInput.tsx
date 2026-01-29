"use client";

import Image from "next/image";
import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSourceDocument, updateLedger } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Send, ChevronDown, ChevronUp } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLedgerData } from "@/hooks/useLedgerData";
import { Ledger } from "@/types/api";

import { useTranslations } from "next-intl";

interface SourceDocumentInputProps {
    ledgerId: string;
    onSuccess?: () => void;
}

export function SourceDocumentInput({ ledgerId, onSuccess }: SourceDocumentInputProps) {
    const t = useTranslations("SourceDocumentInput");
    const tSettings = useTranslations("Settings");
    const tCommon = useTranslations("Common");
    const queryClient = useQueryClient();
    const [text, setText] = useState("");
    const [images, setImages] = useState<{ data: string; mimeType: string }[]>([]);
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { ledger } = useLedgerData(ledgerId);

    const updateLedgerMutation = useMutation({
        mutationFn: (data: Partial<Ledger>) => updateLedger(ledgerId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ledger", ledgerId] });
        },
    });

    const sendMutation = useMutation({
        mutationFn: (data: {
            text?: string;
            images?: { data: string; mimeType: string }[];
        }) =>
            createSourceDocument(ledgerId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sourceDocuments", ledgerId] });
            setText("");
            setImages([]);
            onSuccess?.();
        },
    });

    const handleSend = () => {
        if (!text && images.length === 0) return;
        sendMutation.mutate({
            text: text || undefined,
            images: images.length > 0 ? images : undefined,
        });
    };

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

    const processFiles = (files: File[]) => {
        files.forEach((file) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result as string;
                setImages((prev) => [...prev, { data: base64, mimeType: file.type }]);
            };
            reader.readAsDataURL(file);
        });
    };

    return (
        <div className="space-y-4">
            <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={handlePaste}
                placeholder={t("placeholder")}
                className="resize-none"
                rows={5}
                autoFocus
            />

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
                                <div className="text-sm font-medium">{tSettings("autoConfirm")}</div>
                                <div className="text-xs text-muted leading-tight">{tSettings("autoConfirmDesc")}</div>
                            </div>
                            <Switch
                                checked={ledger?.autoConfirm || false}
                                onCheckedChange={(checked) => {
                                    updateLedgerMutation.mutate({ autoConfirm: checked });
                                }}
                            />
                        </div>

                        {ledger?.autoConfirm && (
                            <div className="bg-danger/10 p-2 rounded text-[10px] text-danger leading-normal animate-in fade-in slide-in-from-top-1 duration-200">
                                ⚠️ {tSettings("riskDesc1")} {tSettings("riskDesc2")}
                            </div>
                        )}

                        <div className="h-px bg-border" />

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <div className="text-sm font-medium">{tSettings("autoRecognizeDate")}</div>
                                <div className="text-xs text-muted leading-tight">{tSettings("autoRecognizeDateDesc")}</div>
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
                                <div className="text-xs text-muted leading-tight">{tSettings("mergeSimilarDesc")}</div>
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
                    disabled={sendMutation.isPending || (!text && images.length === 0)}
                    className="flex-1 sm:flex-initial"
                >
                    {sendMutation.isPending ? tCommon("sending_status") : (
                        <>
                            <Send className="h-4 w-4 mr-2" /> {t("send")}
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
