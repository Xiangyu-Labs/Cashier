"use client";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useModalStackStore } from "@/lib/store/modal-stack";

function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded bg-surface2", className)} />;
}

export function ModalStackLoadingFallback() {
  const item = useModalStackStore((state) => state.stack.at(-1));
  const closeAll = useModalStackStore((state) => state.closeAll);
  const tCommon = useTranslations("Common");
  if (item == null) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && closeAll()}>
      <DialogContent
        variant="detail"
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[min(90dvh,800px)] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:rounded-lg"
        aria-describedby={undefined}
      >
        <DialogHeader className="border-b border-border px-4 py-4 sm:px-6">
          <DialogTitle className="sr-only">{tCommon("loading")}</DialogTitle>
          <Skeleton className="h-5 w-40" />
        </DialogHeader>
        <div
          className="grid min-h-0 flex-1 gap-5 overflow-hidden p-4 sm:grid-cols-[minmax(0,1fr)_18rem] sm:p-6"
          role="status"
          aria-busy="true"
        >
          <div className="space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <Skeleton className="hidden h-full min-h-64 sm:block" />
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
