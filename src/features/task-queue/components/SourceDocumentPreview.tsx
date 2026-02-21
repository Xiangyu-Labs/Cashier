"use client";

import { useState, useEffect } from "react";
import { getSourceDocumentFullAction } from "@/features/source-document/server/actions/main";
import { ImageIcon, FileText, Loader2 } from "lucide-react";
import { ImageViewer } from "@/components/ui/image-viewer";

interface SourceDocumentPreviewProps {
    ledgerId: string;
    sourceDocumentId: string;
}

export function SourceDocumentPreview({
    ledgerId,
    sourceDocumentId,
}: SourceDocumentPreviewProps) {
    const [state, setState] = useState<{
        isLoading: boolean;
        data: {
            text?: string | null;
            imageUrls?: string[] | null;
        } | null;
    }>(() => ({ isLoading: true, data: null }));
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);

    useEffect(() => {
        let cancelled = false;

        // Use setTimeout to defer state update
        setTimeout(() => {
            if (!cancelled) {
                setState({ isLoading: true, data: null });
            }
        }, 0);

        getSourceDocumentFullAction(ledgerId, sourceDocumentId)
            .then((result) => {
                if (!cancelled && result) {
                    setState({
                        isLoading: false,
                        data: {
                            text: result.text,
                            imageUrls: result.imageUrls,
                        }
                    });
                } else if (!cancelled) {
                    setState({ isLoading: false, data: null });
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setState({ isLoading: false, data: null });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [ledgerId, sourceDocumentId]);

    if (state.isLoading) {
        return (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
            </div>
        );
    }

    if (!state.data) return null;

    const hasImages = state.data.imageUrls && state.data.imageUrls.length > 0;
    const hasText = state.data.text && state.data.text.trim().length > 0;

    if (!hasImages && !hasText) return null;

    const handleImageClick = (index: number) => {
        setViewerIndex(index);
        setViewerOpen(true);
    };

    return (
        <>
            <div className="space-y-2">
                {/* Image thumbnails */}
                {hasImages && (
                    <div className="flex items-start gap-2">
                        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex gap-1.5 flex-wrap">
                            {state.data.imageUrls!.slice(0, 4).map((url, idx) => (
                                <img
                                    key={idx}
                                    src={url}
                                    alt={`Input image ${idx + 1}`}
                                    className="h-12 w-12 object-cover rounded border border-border cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => handleImageClick(idx)}
                                />
                            ))}
                            {state.data.imageUrls!.length > 4 && (
                                <div
                                    className="h-12 w-12 flex items-center justify-center rounded border border-border bg-surface2 text-xs text-muted-foreground cursor-pointer hover:bg-surface3 transition-colors"
                                    onClick={() => handleImageClick(4)}
                                >
                                    +{state.data.imageUrls!.length - 4}
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
                            {state.data.text}
                        </p>
                    </div>
                )}
            </div>

            {/* Image Viewer Dialog */}
            {hasImages && (
                <ImageViewer
                    images={state.data.imageUrls!}
                    initialIndex={viewerIndex}
                    open={viewerOpen}
                    onOpenChange={setViewerOpen}
                />
            )}
        </>
    );
}
