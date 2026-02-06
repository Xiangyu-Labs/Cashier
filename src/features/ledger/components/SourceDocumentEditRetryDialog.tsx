"use client";

import { useMemo, useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { SourceDocumentInput } from "@/features/source-document/components/SourceDocumentInput";
import { SourceDocument, SourceDocumentLight } from "@/types/api";
import { useTranslations } from "next-intl";
import { getSourceDocumentFullAction } from "@/features/source-document/server/actions/main";

interface SourceDocumentEditRetryDialogProps {
    ledgerId: string;
    sourceDocument: SourceDocument | SourceDocumentLight;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function SourceDocumentEditRetryDialog({
    ledgerId,
    sourceDocument,
    open,
    onOpenChange,
    onSuccess,
}: SourceDocumentEditRetryDialogProps) {
    const t = useTranslations("SourceDocumentEditRetryDialog");

    // Check if we need to fetch full data (imageUrls may be stripped for completed documents)
    const hasImageUrls = 'imageUrls' in sourceDocument && Array.isArray(sourceDocument.imageUrls) && sourceDocument.imageUrls.length > 0;
    const hasImages = 'hasImages' in sourceDocument && sourceDocument.hasImages;
    const needsFetch = !hasImageUrls && hasImages;

    const [isLoading, setIsLoading] = useState(needsFetch);
    const [fullData, setFullData] = useState<{ text?: string | null; imageUrls?: string[] | null } | null>(null);

    // Fetch full data when dialog opens and we need imageUrls
    useEffect(() => {
        if (!open || !needsFetch) {
            setIsLoading(false);
            setFullData(null);
            return;
        }

        setIsLoading(true);
        getSourceDocumentFullAction(ledgerId, sourceDocument.id)
            .then((result) => {
                if (result) {
                    setFullData({
                        text: result.text,
                        imageUrls: result.imageUrls,
                    });
                }
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [open, needsFetch, ledgerId, sourceDocument.id]);

    const initialData = useMemo(() => {
        // If we fetched full data, use it
        if (fullData) {
            return {
                text: fullData.text || undefined,
                images: fullData.imageUrls?.map(url => ({
                    data: url,
                    mimeType: "image/jpeg",
                })) || [],
            };
        }

        // Otherwise use existing sourceDocument data
        const imageUrls = 'imageUrls' in sourceDocument ? sourceDocument.imageUrls : undefined;
        return {
            text: sourceDocument.text || undefined,
            images: imageUrls?.map(url => ({
                data: url,
                mimeType: "image/jpeg",
            })) || [],
        };
    }, [sourceDocument, fullData]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                </DialogHeader>
                {isLoading ? (
                    <EditRetryDialogSkeleton />
                ) : (
                    <SourceDocumentInput
                        ledgerId={ledgerId}
                        mode="retry"
                        sourceDocumentId={sourceDocument.id}
                        initialData={initialData}
                        onSuccess={() => {
                            onOpenChange(false);
                            onSuccess?.();
                        }}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

/** Skeleton loading state for the edit-retry dialog */
function EditRetryDialogSkeleton() {
    return (
        <div className="space-y-4 animate-pulse">
            {/* Image preview skeleton */}
            <div className="grid grid-cols-4 gap-2">
                {[1, 2].map((idx) => (
                    <div key={idx} className="aspect-square rounded-md bg-surface2 border border-border" />
                ))}
            </div>
            {/* Textarea skeleton */}
            <div className="h-[120px] rounded-md bg-surface2 border border-border" />
            {/* Advanced features fold skeleton */}
            <div className="h-10 rounded-lg bg-surface2 border border-border" />
            {/* Action buttons skeleton */}
            <div className="flex items-center gap-2">
                <div className="h-9 w-20 rounded-md bg-surface2" />
                <div className="flex-1" />
                <div className="h-9 w-24 rounded-md bg-surface2" />
            </div>
        </div>
    );
}
