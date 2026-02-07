"use client";

import { useState, useEffect } from "react";
import { getSourceDocumentFullAction } from "@/features/source-document/server/actions/main";
import { ImageIcon, FileText, Loader2 } from "lucide-react";

interface SourceDocumentPreviewProps {
    ledgerId: string;
    sourceDocumentId: string;
}

export function SourceDocumentPreview({
    ledgerId,
    sourceDocumentId,
}: SourceDocumentPreviewProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<{
        text?: string | null;
        imageUrls?: string[] | null;
    } | null>(null);

    useEffect(() => {
        setIsLoading(true);
        getSourceDocumentFullAction(ledgerId, sourceDocumentId)
            .then((result) => {
                if (result) {
                    setData({
                        text: result.text,
                        imageUrls: result.imageUrls,
                    });
                }
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [ledgerId, sourceDocumentId]);

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
            </div>
        );
    }

    if (!data) return null;

    const hasImages = data.imageUrls && data.imageUrls.length > 0;
    const hasText = data.text && data.text.trim().length > 0;

    if (!hasImages && !hasText) return null;

    return (
        <div className="space-y-2">
            {/* Image thumbnails */}
            {hasImages && (
                <div className="flex items-start gap-2">
                    <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex gap-1.5 flex-wrap">
                        {data.imageUrls!.slice(0, 4).map((url, idx) => (
                            <img
                                key={idx}
                                src={url}
                                alt={`Input image ${idx + 1}`}
                                className="h-12 w-12 object-cover rounded border border-border"
                            />
                        ))}
                        {data.imageUrls!.length > 4 && (
                            <div className="h-12 w-12 flex items-center justify-center rounded border border-border bg-surface2 text-xs text-muted-foreground">
                                +{data.imageUrls!.length - 4}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Text preview */}
            {hasText && (
                <div className="flex items-start gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-xs text-text line-clamp-3 whitespace-pre-wrap">
                        {data.text}
                    </p>
                </div>
            )}
        </div>
    );
}
