"use client";

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

export function ConfirmDialog({
    title,
    description,
    onConfirm,
    trigger,
    open,
    onOpenChange,
    confirmLabel = "确认",
    cancelLabel = "取消",
    variant = "default",
}: ConfirmDialogProps) {
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
                        <Button variant="outline">{cancelLabel}</Button>
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
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
