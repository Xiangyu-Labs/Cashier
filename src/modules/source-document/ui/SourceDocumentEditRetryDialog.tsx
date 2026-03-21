"use client";
import type { SourceDocumentLight } from "@/modules/source-document/contracts";
import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SourceDocumentInput } from "./SourceDocumentInput";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { getSourceDocumentFullAction } from "@/modules/source-document/actions";
import { queryKeys } from "@/lib/query-keys";

interface SourceDocumentEditRetryDialogProps {
  ledgerId: string;
  sourceDocument: SourceDocument | SourceDocumentLight | { id: string };
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
  // Also fetch if the sourceDocument is minimal (e.g., from task queue anomaly records that only have id/title)
  const hasImageUrls =
    "imageUrls" in sourceDocument &&
    Array.isArray(sourceDocument.imageUrls) &&
    sourceDocument.imageUrls.length > 0;
  const hasText = "text" in sourceDocument && sourceDocument.text != null && sourceDocument.text !== "";
  const hasImages = "hasImages" in sourceDocument && sourceDocument.hasImages;
  // needsFetch is true when:
  // 1. No imageUrls but hasImages flag is true (stripped for performance)
  // 2. No imageUrls AND no text (minimal object, likely from TaskQueueModal)
  const needsFetch = (!hasImageUrls && hasImages) || (!hasImageUrls && !hasText);

  // Use TanStack Query to fetch full data - simpler than manual useEffect
  const { data: fullData, isLoading } = useQuery({
    queryKey: queryKeys.sourceDocumentFull(ledgerId, sourceDocument.id),
    queryFn: async () => {
      const result = await getSourceDocumentFullAction(ledgerId, sourceDocument.id);
      if (result == null) return null;
      return {
        text: result.text,
        imageUrls: result.imageUrls,
      };
    },
    enabled: open && needsFetch,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const initialData = useMemo(() => {
    // If we fetched full data, use it
    if (fullData != null) {
      return {
        images:
          fullData.imageUrls?.map((url) => ({
            data: url,
            mimeType: "image/jpeg",
          })) ?? [],
        ...(fullData.text != null ? { text: fullData.text } : {}),
      };
    }

    // Otherwise use existing sourceDocument data
    const imageUrls = "imageUrls" in sourceDocument ? sourceDocument.imageUrls : undefined;
    const text = "text" in sourceDocument ? sourceDocument.text : undefined;
    return {
      images:
        imageUrls?.map((url) => ({
          data: url,
          mimeType: "image/jpeg",
        })) ?? [],
      ...(text != null ? { text } : {}),
    };
  }, [sourceDocument, fullData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
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
