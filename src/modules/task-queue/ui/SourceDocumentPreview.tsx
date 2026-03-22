"use client";
import { useState, useEffect } from "react";
import { getSourceDocumentFullAction } from "@/modules/source-document/actions";
import { ImageIcon, FileText, Loader2 } from "lucide-react";
import Image from "next/image";
import { SourceDocumentImageModal } from "@/modules/source-document/ui";

interface SourceDocumentPreviewProps {
  ledgerId: string;
  sourceDocumentId: string;
}

export function SourceDocumentPreview({ ledgerId, sourceDocumentId }: SourceDocumentPreviewProps) {
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
        if (!cancelled && result != null) {
          setState({
            isLoading: false,
            data: {
              text: result.text,
              imageUrls: result.imageUrls,
            },
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

  if (state.data == null) return null;

  const hasImages = (state.data.imageUrls?.length ?? 0) > 0;
  const hasText = state.data.text != null && state.data.text.trim().length > 0;

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
                <div
                  key={idx}
                  className="relative h-12 w-12 cursor-pointer"
                  onClick={() => handleImageClick(idx)}
                >
                  <Image
                    src={url}
                    alt={`Input image ${idx + 1}`}
                    fill
                    unoptimized
                    className="object-cover rounded border border-border hover:opacity-80 transition-opacity"
                  />
                </div>
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
            <p className="text-xs text-text line-clamp-3 whitespace-pre-wrap">{state.data.text}</p>
          </div>
        )}
      </div>

      {/* Source document image modal (read-only) */}
      {hasImages && (
        <SourceDocumentImageModal
          images={state.data.imageUrls!.map((url) => ({ data: url, mimeType: "image/jpeg" }))}
          initialIndex={viewerIndex}
          open={viewerOpen}
          editable={false}
          onOpenChange={setViewerOpen}
        />
      )}
    </>
  );
}
