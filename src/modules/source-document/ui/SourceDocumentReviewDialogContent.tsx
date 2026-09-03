import type { PropsWithChildren, ReactNode } from "react";
import { DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw } from "lucide-react";
import { ReviewPanelSkeleton } from "./SourceDocumentDuplicateReviewDialog/components/ReviewPanelSkeleton";

interface SourceDocumentReviewDialogContentProps extends PropsWithChildren {
  isPending: boolean;
  isLoading: boolean;
  isReloading: boolean;
  loadingLabel: string;
  hasError: boolean;
  errorMessage: string;
  reloadLabel: string;
  onReload: () => void;
  header: ReactNode;
  footer: ReactNode;
  onExitComplete?: () => void;
}

export function SourceDocumentReviewDialogContent({
  children,
  isPending,
  isLoading,
  isReloading,
  loadingLabel,
  hasError,
  errorMessage,
  reloadLabel,
  onReload,
  header,
  footer,
  onExitComplete,
}: SourceDocumentReviewDialogContentProps) {
  return (
    <DialogContent
      variant="detail"
      className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[min(88dvh,760px)] sm:w-[calc(100vw-2rem)] sm:max-w-5xl sm:rounded-lg"
      aria-describedby={undefined}
      hideCloseButton={isPending}
      onEscapeKeyDown={(event) => isPending && event.preventDefault()}
      onPointerDownOutside={(event) => isPending && event.preventDefault()}
      {...(onExitComplete === undefined ? {} : { onExitComplete })}
    >
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div
            className="grid min-w-0 gap-4 md:grid-cols-2"
            aria-busy="true"
            aria-label={loadingLabel}
          >
            <ReviewPanelSkeleton />
            <ReviewPanelSkeleton />
          </div>
        ) : hasError ? (
          <div
            className="flex min-h-48 flex-col items-center justify-center gap-3 text-center"
            aria-busy={isReloading}
          >
            <p className="text-sm text-danger">{errorMessage}</p>
            <Button variant="outline" size="sm" onClick={onReload} disabled={isReloading}>
              {isReloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              {reloadLabel}
            </Button>
          </div>
        ) : (
          children
        )}
      </div>
      <div className="flex shrink-0 flex-wrap-reverse justify-end gap-2 border-t bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:py-3">
        {footer}
      </div>
      {isPending && <div className="absolute inset-0 z-50 cursor-wait bg-surface/20" aria-hidden />}
    </DialogContent>
  );
}
