"use client";
import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SourceDocumentInput } from "./SourceDocumentInput";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { getSourceDocumentFullAction } from "@/modules/source-document/actions";
import { queryKeys } from "@/lib/query-keys";
import {
  buildSourceDocumentRetrySeed,
  type RetrySeedSourceDocument,
} from "./source-document-retry-seed";

interface SourceDocumentEditRetryDialogProps {
  ledgerId: string;
  sourceDocument: RetrySeedSourceDocument;
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

  const hasImageUrls = (sourceDocument.imageUrls?.length ?? 0) > 0;
  const hasText = sourceDocument.text != null && sourceDocument.text !== "";
  const needsFetch =
    (!hasImageUrls && sourceDocument.hasImages === true) || (!hasImageUrls && !hasText);

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

  const initialData = useMemo(
    () => buildSourceDocumentRetrySeed(sourceDocument, fullData ?? undefined),
    [sourceDocument, fullData]
  );

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
