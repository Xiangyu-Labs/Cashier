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
}: ConfirmDialogProps) {
    const t = useTranslations("Common");
    const displayConfirmLabel = confirmLabel || t("confirm");
    const displayCancelLabel = cancelLabel || t("cancel");

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">{displayCancelLabel}</Button>
                    </DialogClose>
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
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});
