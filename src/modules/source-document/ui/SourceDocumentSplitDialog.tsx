"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { formatDateTimeForApi } from "@/lib/date-utils";

interface SourceDocumentSplitDialogProps {
  open: boolean;
  selectedEntries?: LedgerEntry[];
  selectedCount?: number;
  initialDate: string;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (entryDate: string) => Promise<void>;
}

export function SourceDocumentSplitDialog({
  open,
  selectedEntries = [],
  selectedCount,
  initialDate,
  isSubmitting,
  onOpenChange,
  onSubmit,
}: SourceDocumentSplitDialogProps) {
  const t = useTranslations("SourceDocumentDetail");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const [entryDate, setEntryDate] = useState(() => initialDate);
  const previewEntries = selectedEntries.slice(0, 5);
  const remainingCount = selectedEntries.length - previewEntries.length;
  const totalSelected = selectedCount ?? selectedEntries.length;

  // Quick date presets, computed in local time (dates are stored as yyyy-MM-dd).
  const datePresets = (() => {
    const day = (offset: number) => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      return formatDateTimeForApi(date);
    };
    return [
      { label: t("splitDateToday"), value: day(0) },
      { label: t("splitDateYesterday"), value: day(-1) },
      { label: t("splitDateDayBeforeYesterday"), value: day(-2) },
    ];
  })();

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
          {t("splitDescription", { count: totalSelected })}
        </p>
        <ul className="divide-y rounded-lg border">
          {previewEntries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">{entry.itemName}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatCurrencyAmount(entry.amount, entry.currency ?? "CNY", locale)}
              </span>
            </li>
          ))}
        </ul>
        {remainingCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("splitMore", { count: remainingCount })}
          </p>
        ) : null}
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
          <div className="flex flex-wrap gap-2">
            {datePresets.map((preset) => (
              <Button
                key={preset.value}
                type="button"
                variant={entryDate === preset.value ? "default" : "outline"}
                size="sm"
                className="h-8"
                disabled={isSubmitting}
                onClick={() => setEntryDate(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
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
