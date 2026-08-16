"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Calendar, Loader2, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SourceDocumentSplitDialogProps {
  open: boolean;
  selectedCount: number;
  initialDate: string;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (entryDate: string) => Promise<void>;
}

export function SourceDocumentSplitDialog({
  open,
  selectedCount,
  initialDate,
  isSubmitting,
  onOpenChange,
  onSubmit,
}: SourceDocumentSplitDialogProps) {
  const t = useTranslations("SourceDocumentDetail");
  const tCommon = useTranslations("Common");
  const [entryDate, setEntryDate] = useState(() => initialDate);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSubmitting && onOpenChange(nextOpen)}>
      <DialogContent
        variant="modal"
        className="sm:max-w-md"
        hideCloseButton={isSubmitting}
        onEscapeKeyDown={(event) => isSubmitting && event.preventDefault()}
        onPointerDownOutside={(event) => isSubmitting && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="size-4" />
            {t("splitTitle")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("splitDescription", { count: selectedCount })}
        </p>
        <div className="grid gap-2">
          <Label htmlFor="split-entry-date">{t("splitDate")}</Label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="split-entry-date"
              type="date"
              required
              value={entryDate}
              disabled={isSubmitting}
              className="pl-9"
              onChange={(event) => setEntryDate(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            disabled={isSubmitting || entryDate === ""}
            onClick={() => void onSubmit(entryDate)}
          >
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Scissors className="size-4" />
            )}
            {t("splitTitle")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
