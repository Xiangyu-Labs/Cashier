"use client";

import Image from "next/image";
import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSourceDocument } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Send } from "lucide-react";

import { useTranslations } from "next-intl";

interface SourceDocumentInputProps {
    ledgerId: string;
    onSuccess?: () => void;
}

export function SourceDocumentInput({ ledgerId, onSuccess }: SourceDocumentInputProps) {
    const t = useTranslations("TransactionInput"); // Keep translation key for now or rename later
    const tCommon = useTranslations("Common");
    const queryClient = useQueryClient();
    const [text, setText] = useState("");
    const [images, setImages] = useState<{ data: string; mimeType: string }[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
                <div className="flex flex-wrap gap-2">
                    {images.map((img, idx) => (
                        <div key={idx} className="relative group">
                            <Image
                                src={img.data}
                                alt={`Uploaded ${idx + 1}`}
                                width={80}
                                height={80}
                                className="object-cover rounded-md border border-border"
                            />
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
