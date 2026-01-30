"use client";

import { useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { SourceDocumentInput } from "./SourceDocumentInput";
import { SourceDocument } from "@/types/api";
import { useTranslations } from "next-intl";

interface SourceDocumentEditRetryDialogProps {
    ledgerId: string;
    sourceDocument: SourceDocument;
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

    const initialData = useMemo(() => ({
        text: sourceDocument.text || undefined,
        images: sourceDocument.imageUrls?.map(url => ({
            data: url,
            mimeType: "image/jpeg", // Assume JPEG for stored URLs
        })) || [],
    }), [sourceDocument.text, sourceDocument.imageUrls]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                </DialogHeader>
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
            </DialogContent>
        </Dialog>
    );
}
