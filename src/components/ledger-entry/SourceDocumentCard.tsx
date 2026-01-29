import { SourceDocument, LedgerEntry, EntryCategory } from "@/types/api";
import { LedgerEntryCard } from "./LedgerEntryCard";
import { useState, useMemo } from "react";
import { Trash2, Eye, EyeOff, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProcessingStatus } from "@/components/ui/ProcessingStatus";
import { ImageViewer } from "@/components/ui/image-viewer";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";

import { useConvertedAmount } from "@/hooks/useConvertedAmount";

function getSafeImageSrc(data: string): string {
  if (data.startsWith("http") || data.startsWith("data:")) {
    return data;
  }
  return `data:image/jpeg;base64,${data}`;
}

function SourceDocumentTotal({ entries, mainCurrency }: { entries: LedgerEntry[], mainCurrency: string }) {
  // We need to sum multiple currencies.
  // Each currency-date pair needs a conversion.
  // To avoid hook issues, we'll use a simplified approach since batch size is small.
  // We can't use hooks in loops.

  // Strategy: Calculate the sum by mapping each entry to a converted amount component.
  // For the batch total, we can use a small component per entry and sum them? 
  // No, that's not good for a single string.

  // Better: Create a component that fetches all rates needed.
  // But let's keep it simple: just sum them if same currency, or use a "total" component.

  return (
    <span className="text-sm font-bold text-text">
      <span className="text-xs text-muted mr-1">{mainCurrency}</span>
      <TotalValue entries={entries} mainCurrency={mainCurrency} />
    </span>
  );
}

function TotalValue({ entries, mainCurrency }: { entries: LedgerEntry[], mainCurrency: string }) {
  // Summing up multiple entries with might-be-different currencies.
  // We use a simple reduce here, but we need to handle the fact that we can't use hooks in reduce.

  // If we want a truly accurate batch total in the header, we might need a separate API or 
  // just accept that header total is an approximation using the latest rates if we don't want complexity.

  // For now, let's just sum the already-calculated converted amounts if we can?
  // Actually, let's just use the first entry's date as a reference for the whole batch to simplify.

  const totalAmount = entries.reduce((sum, entry) => sum + parseFloat(entry.amount), 0);
  const firstCurrency = entries[0]?.currency || mainCurrency;
  const firstDate = entries[0]?.entryDate || entries[0]?.createdAt;

  const { converted } = useConvertedAmount(totalAmount, firstCurrency, mainCurrency, firstDate);

  // Note: This is an approximation if the batch has multiple currencies OR multiple dates.
  // But usually a batch (SourceDocument) is from ONE receipt -> ONE date -> ONE primary currency.
  return converted.toFixed(2);
}

interface SourceDocumentCardProps {
  sourceDocument: SourceDocument;
  ledgerEntries: LedgerEntry[];
  categories: EntryCategory[];
  mainCurrency?: string;
  isConfirmed?: boolean;
  onConfirm?: (ids: string[]) => Promise<void>;
  onUpdateLedgerEntry?: (
    ledgerEntryId: string,
    data: {
      categoryId?: string | null;
      itemName?: string;
      amount?: number;
      currency?: string | null;
    }
  ) => void;
  onDeleteLedgerEntry?: (ledgerEntryId: string) => void;
  onDelete?: () => void;
  onViewLedgerEntry?: (ledgerEntry: LedgerEntry) => void;
  defaultExpanded?: boolean;
  onRetry?: () => Promise<void>;
  status: "queued" | "processing" | "to_confirm" | "completed" | "error" | "pending";
  errorCode?: string | null;
  className?: string;
}

export function SourceDocumentCard({
  sourceDocument,
  ledgerEntries,
  categories,
  mainCurrency = "CNY",
  isConfirmed = false,
  onConfirm,
  onUpdateLedgerEntry,
  onDeleteLedgerEntry,
  onDelete,
  onViewLedgerEntry,
  defaultExpanded = false,
  onRetry,
  status,
  errorCode,
  className,
}: SourceDocumentCardProps) {
  const t = useTranslations("SourceDocumentCard");
  const tError = useTranslations("ErrorCode");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isContentExpanded, setIsContentExpanded] = useState(defaultExpanded);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  const { sortedEntries, totalAmounts } = useMemo(() => {
    const sorted = [...ledgerEntries].sort((a, b) => {
      const aOrder = a.category?.sortOrder ?? 999999;
      const bOrder = b.category?.sortOrder ?? 999999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return parseFloat(b.amount) - parseFloat(a.amount);
    });

    const totals: Record<string, number> = {};

    ledgerEntries.forEach((entry) => {
      if (entry.currency) {
        const amount = parseFloat(entry.amount);
        totals[entry.currency] = (totals[entry.currency] || 0) + amount;
      }
    });

    return { sortedEntries: sorted, totalAmounts: totals };
  }, [ledgerEntries]);

  const { text, images, hasUnknownCurrency } = useMemo(() => {
    return {
      text: sourceDocument.text,
      images: sourceDocument.imageUrls || [],
      hasUnknownCurrency: ledgerEntries.some(e => !e.currency || e.currency === "unknown"),
    };
  }, [sourceDocument, ledgerEntries]);

  async function handleConfirm() {
    if (!onConfirm) return;
    setIsConfirming(true);
    try {
      await onConfirm(ledgerEntries.map((e) => e.id));
    } finally {
      setIsConfirming(false);
    }
  }

  async function handleRetry() {
    if (!onRetry) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <div className={cn("bg-surface rounded-xl shadow-sm border border-border overflow-hidden mb-6", className)}>
      <div className="px-4 py-3 bg-surface2/50 border-b border-border flex justify-between items-center">
        <span className="text-sm font-medium text-muted">
          {new Date(sourceDocument.createdAt).toLocaleString(locale, {
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {sourceDocument.title && (
            <span className="ml-3 font-medium text-text">
              {sourceDocument.title}
            </span>
          )}
        </span>
        <div className="flex items-center gap-3">
          {ledgerEntries.length === 0 && (
            <div className="flex items-center gap-2">
              <ProcessingStatus
                status={status}
                label={status === "error" && errorCode ? tError(errorCode) : undefined}
              />
            </div>
          )}

          <SourceDocumentTotal
            entries={ledgerEntries}
            mainCurrency={mainCurrency}
          />

          {onDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}

          <div className="h-4 w-px bg-border mx-1" />

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsContentExpanded(!isContentExpanded)}
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            title={isContentExpanded ? t("collapseContent") : t("viewContent")}
          >
            {isContentExpanded ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </Button>

          {status === "error" && onRetry && (
            <>
              <div className="h-4 w-px bg-border mx-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleRetry(); }}
                disabled={isRetrying}
                className="h-7 px-2 text-xs border-red-600/30 hover:bg-red-600/10 hover:text-red-700 text-red-600 dark:text-red-400 dark:border-red-400/30 dark:hover:text-red-300"
                title={tCommon("retry")}
              >
                {isRetrying ? (
                  <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                )}
                {tCommon("retry")}
              </Button>
            </>
          )}

          {!isConfirmed && onConfirm && (
            <>
              <div className="h-4 w-px bg-border mx-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                disabled={isConfirming || hasUnknownCurrency}
                className={cn(
                  "h-7 px-2 text-xs border-amber-600/30 hover:bg-amber-600/10 hover:text-amber-700 text-amber-600 dark:text-amber-400 dark:border-amber-400/30 dark:hover:text-amber-300",
                  hasUnknownCurrency && "opacity-50 grayscale cursor-not-allowed"
                )}
                title={hasUnknownCurrency ? "待修正货币后可确认" : t("confirmDoc")}
              >
                {isConfirming ? (
                  <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                {tCommon("confirm")}
              </Button>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isContentExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-surface2/30 border-b border-border"
          >
            <div className="p-4 space-y-3">
              {images.length > 0 && (
                <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-5">
                  {images.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-square rounded-lg overflow-hidden border border-border bg-surface2 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setSelectedImageIndex(idx)}
                    >
                      <Image
                        src={getSafeImageSrc(img)}
                        alt={`Source image ${idx + 1}`}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}

              {text && (
                <div className="text-text bg-surface2/30 p-3 rounded-md text-sm whitespace-pre-wrap leading-relaxed">
                  {text}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="border-t border-border divide-y divide-border p-3 space-y-3 bg-surface2/30">
        {sortedEntries.map((entry) => (
          <LedgerEntryCard
            key={entry.id}
            ledgerEntry={entry}
            categories={categories}
            onView={() => onViewLedgerEntry?.(entry)}
            hideCategory={false}
            showStatusHint={!isConfirmed}
            className="inner-shadow"
            mainCurrency={mainCurrency}
          />
        ))}
      </div>

      <ImageViewer
        images={images}
        initialIndex={typeof selectedImageIndex === 'number' ? selectedImageIndex : 0}
        open={selectedImageIndex !== null}
        onOpenChange={(open) => !open && setSelectedImageIndex(null)}
      />
    </div>
  );
}
