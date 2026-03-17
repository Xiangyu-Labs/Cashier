"use client";
import { memo } from "react";
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
  onConfirm: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onSave?: () => void;
  saveLabel?: string;
  onDiscard?: () => void;
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
  const displayConfirmLabel = confirmLabel ?? t("confirm");
  const displayCancelLabel = cancelLabel ?? t("cancel");
  const displaySaveLabel = saveLabel ?? t("save");
  const displayDiscardLabel = discardLabel ?? t("discard");

  // Check if we're using the three-button layout (for unsaved changes dialog)
  const hasThreeButtonLayout = onSave != null || onDiscard != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger != null && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter
          className={hasThreeButtonLayout ? "justify-between sm:justify-between" : undefined}
        >
          {hasThreeButtonLayout && onDiscard && (
            <Button
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDiscard();
                if (onOpenChange) {
                  onOpenChange(false);
                }
              }}
            >
              {displayDiscardLabel}
            </Button>
          )}
          <div className="flex gap-2 justify-end">
            <DialogClose asChild>
              <Button variant="outline">{displayCancelLabel}</Button>
            </DialogClose>
            {hasThreeButtonLayout && onSave ? (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  onSave();
                  if (onOpenChange) {
                    onOpenChange(false);
                  }
                }}
              >
                {displaySaveLabel}
              </Button>
            ) : (
              <Button
                variant={variant}
                onClick={(e) => {
                  e.stopPropagation();
                  onConfirm();
                  if (onOpenChange) {
                    onOpenChange(false);
                  }
                }}
              >
                {displayConfirmLabel}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
