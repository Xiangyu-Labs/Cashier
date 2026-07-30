"use client";
import { memo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

interface ConfirmDialogProps {
  title: string;
  description: string;
  onConfirm: () => void | Promise<void>;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onSave?: () => void | Promise<void>;
  saveLabel?: string;
  onDiscard?: () => void | Promise<void>;
  discardLabel?: string;
}

import { useTranslations } from "next-intl";

export const ConfirmDialog = memo(function ConfirmDialog({
  title,
  description,
  onConfirm,
  trigger,
  open,
  onOpenChange,
  confirmLabel,
  cancelLabel,
  variant = "default",
  onSave,
  saveLabel,
  onDiscard,
  discardLabel,
}: ConfirmDialogProps) {
  const t = useTranslations("Common");
  const [isPending, setIsPending] = useState(false);
  const displayConfirmLabel = confirmLabel ?? t("confirm");
  const displayCancelLabel = cancelLabel ?? t("cancel");
  const displaySaveLabel = saveLabel ?? t("save");
  const displayDiscardLabel = discardLabel ?? t("discard");

  // Check if we're using the three-button layout (for unsaved changes dialog)
  const hasThreeButtonLayout = onSave != null || onDiscard != null;
  const dialogProps = {
    ...(open !== undefined ? { open } : {}),
    ...(onOpenChange !== undefined
      ? { onOpenChange: (nextOpen: boolean) => !isPending && onOpenChange(nextOpen) }
      : {}),
  };
  const footerProps = hasThreeButtonLayout
    ? { className: "justify-between sm:justify-between" }
    : {};

  return (
    <Dialog {...dialogProps}>
      {trigger != null && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        variant="modal"
        onEscapeKeyDown={(event) => isPending && event.preventDefault()}
        onPointerDownOutside={(event) => isPending && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter {...footerProps}>
          {hasThreeButtonLayout && onDiscard && (
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={async (e) => {
                e.stopPropagation();
                setIsPending(true);
                try {
                  await onDiscard();
                  onOpenChange?.(false);
                } catch {
                  // The owning mutation reports the error; keep this dialog open.
                } finally {
                  setIsPending(false);
                }
              }}
            >
              {displayDiscardLabel}
            </Button>
          )}
          <div className="flex gap-2 justify-end">
            <DialogClose asChild>
              <Button variant="outline" disabled={isPending}>
                {displayCancelLabel}
              </Button>
            </DialogClose>
            {hasThreeButtonLayout && onSave ? (
              <Button
                className="bg-success text-white hover:bg-success/90"
                disabled={isPending}
                onClick={async (e) => {
                  e.stopPropagation();
                  setIsPending(true);
                  try {
                    await onSave();
                    onOpenChange?.(false);
                  } catch {
                    // The owning mutation reports the error; keep this dialog open.
                  } finally {
                    setIsPending(false);
                  }
                }}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {displaySaveLabel}
              </Button>
            ) : (
              <Button
                variant={variant}
                disabled={isPending}
                onClick={async (e) => {
                  e.stopPropagation();
                  setIsPending(true);
                  try {
                    await onConfirm();
                    onOpenChange?.(false);
                  } catch {
                    // The owning mutation reports the error; keep this dialog open.
                  } finally {
                    setIsPending(false);
                  }
                }}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {displayConfirmLabel}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
