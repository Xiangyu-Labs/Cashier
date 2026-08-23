"use client";
import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SourceDocumentInput } from "./SourceDocumentInput";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { getSourceDocumentFullAction } from "@/modules/source-document/actions";
import { queryKeys } from "@/lib/query-keys";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
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
  onPendingChange?: (pending: boolean) => void;
}

export function SourceDocumentEditRetryDialog({
  ledgerId,
  sourceDocument,
  open,
  onOpenChange,
  onSuccess,
  onPendingChange,
}: SourceDocumentEditRetryDialogProps) {
  const t = useTranslations("SourceDocumentEditRetryDialog");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const closeRequestedRef = useRef(false);

  const requestClose = () => {
    if (isSubmitting) return;
    if (isDirty) {
      closeRequestedRef.current = true;
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const hasStoredFiles = (sourceDocument.files?.length ?? 0) > 0;
  const hasText = sourceDocument.text != null && sourceDocument.text !== "";
  const needsFetch =
    (!hasStoredFiles && sourceDocument.hasImages === true) || (!hasStoredFiles && !hasText);

  const {
    data: fullData,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.sourceDocumentFull(ledgerId, sourceDocument.id),
    queryFn: async () => {
      const result = await getSourceDocumentFullAction(ledgerId, sourceDocument.id);
      if (result == null) return null;
      return {
        text: result.text,
        files: result.files,
      };
    },
    enabled: open && needsFetch,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });

  const initialData = useMemo(
    () => buildSourceDocumentRetrySeed(sourceDocument, fullData ?? undefined),
    [sourceDocument, fullData]
  );
  const seedReady = !needsFetch || fullData != null;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
      <DialogContent
        variant="detail"
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100vw-2rem)] sm:max-w-lg sm:rounded-lg"
        aria-describedby={undefined}
        hideCloseButton={isSubmitting}
        onEscapeKeyDown={(event) => {
          if (isSubmitting || isDirty) {
            event.preventDefault();
            if (!isSubmitting) requestClose();
          }
        }}
        onPointerDownOutside={(event) => {
          if (isSubmitting || isDirty) {
            event.preventDefault();
            if (!isSubmitting) requestClose();
          }
        }}
      >
        <DialogHeader className="shrink-0 border-b px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div
          className="relative min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6"
          aria-busy={isLoading || isFetching || isInitializing}
        >
          {isLoading ? (
            <EditRetryDialogSkeleton />
          ) : error != null || !seedReady ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-destructive" role="alert">
                {t("loadError")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={isFetching ? "size-4 animate-spin" : "size-4"} />
                {t("reload")}
              </Button>
            </div>
          ) : (
            <div className="relative">
              <SourceDocumentInput
                ledgerId={ledgerId}
                mode="retry"
                sourceDocumentId={sourceDocument.id}
                initialData={initialData}
                onPendingChange={(pending) => {
                  setIsSubmitting(pending);
                  onPendingChange?.(pending);
                }}
                onInitializingChange={setIsInitializing}
                onDirtyChange={setIsDirty}
                onSuccess={() => {
                  onOpenChange(false);
                  onSuccess?.();
                }}
              />
              {isInitializing ? (
                <div className="absolute inset-0 z-10 bg-background" aria-hidden="true">
                  <EditRetryDialogSkeleton />
                </div>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={t("unsavedTitle")}
        description={t("unsavedDescription")}
        cancelLabel={t("continueEditing")}
        confirmLabel={t("discardAndLeave")}
        variant="destructive"
        onConfirm={() => {
          setIsDirty(false);
          setDiscardOpen(false);
          if (closeRequestedRef.current) onOpenChange(false);
          closeRequestedRef.current = false;
        }}
      />
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
