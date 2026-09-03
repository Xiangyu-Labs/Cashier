import type { PropsWithChildren } from "react";
import { DialogContent } from "@/components/ui/dialog";

interface SourceDocumentReviewDialogContentProps extends PropsWithChildren {
  isPending: boolean;
  onExitComplete?: () => void;
}

export function SourceDocumentReviewDialogContent({
  children,
  isPending,
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
      {children}
    </DialogContent>
  );
}
