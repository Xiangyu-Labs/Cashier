"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { AmountText } from "@/modules/currency/ui/amount-text";
import { storedFileReadUrl } from "../../../stored-file-read";
import { SourceDocumentImageModal } from "../../SourceDocumentImageModal";
import {
  summarizeReviewEntries,
  type ReviewSide,
} from "../../source-document-duplicate-review.utils";

export function ReviewPanel({
  side,
  label,
  tone,
  badge,
  mainCurrency,
  locale,
}: {
  side: ReviewSide;
  label: string;
  tone: "original" | "candidate";
  badge?: string;
  mainCurrency: string;
  locale: string;
}) {
  const t = useTranslations("DuplicateReview");
  const [imageViewer, setImageViewer] = useState<{ open: boolean; index: number }>({
    open: false,
    index: 0,
  });
  const summary = summarizeReviewEntries(side.entries, mainCurrency);

  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border bg-surface",
        tone === "candidate" ? "border-primary/40" : "border-border"
      )}
    >
      <header
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3",
          tone === "candidate" ? "bg-primary/5" : "bg-surface2/50"
        )}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn("text-sm font-semibold", tone === "candidate" && "text-primary")}>
              {label}
            </h3>
            {badge != null && (
              <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">
                {badge}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {side.title?.trim() || t("untitled")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("date", { date: side.entryDate ?? side.createdAt.slice(0, 10) })}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <AmountText variant="summary">
            {formatCurrencyAmount(summary.total, mainCurrency, locale)}
          </AmountText>
          {Object.entries(summary.currencyTotals).map(([currency, total]) => (
            <AmountText key={currency} variant="secondary">
              {formatCurrencyAmount(total, currency, locale)}
            </AmountText>
          ))}
          {summary.unconvertedCount > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {t("unconverted", { count: summary.unconvertedCount })}
            </p>
          )}
        </div>
      </header>

      {side.files.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-3">
          {side.files.map((file, index) => (
            <button
              key={file.id}
              type="button"
              className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onClick={() => setImageViewer({ open: true, index })}
              aria-label={t("viewImage", {
                filename: file.originalFilename ?? t("image"),
              })}
            >
              <Image
                src={storedFileReadUrl(file.id)}
                alt={file.originalFilename ?? t("image")}
                width={64}
                height={64}
                unoptimized
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      <div className="divide-y divide-border">
        {side.entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("noEntries")}</p>
        ) : (
          side.entries.map((entry) => {
            const currency = entry.currency ?? mainCurrency;
            return (
              <div key={entry.id} className="flex min-w-0 items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-text">{entry.itemName}</p>
                  {entry.description != null && entry.description !== "" && (
                    <p className="break-words text-xs text-muted-foreground">{entry.description}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <AmountText variant="item">
                    {formatCurrencyAmount(entry.amount, currency, locale)}
                  </AmountText>
                  {entry.convertedAmount != null && currency !== mainCurrency && (
                    <AmountText variant="secondary">
                      {formatCurrencyAmount(entry.convertedAmount, mainCurrency, locale)}
                    </AmountText>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <SourceDocumentImageModal
        images={side.files.map((file) => ({
          data: "",
          mimeType: file.contentType,
          storedFileId: file.id,
        }))}
        initialIndex={imageViewer.index}
        open={imageViewer.open}
        onOpenChange={(open) => setImageViewer((previous) => ({ ...previous, open }))}
      />
    </section>
  );
}
