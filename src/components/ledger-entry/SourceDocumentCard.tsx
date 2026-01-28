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

function getSafeImageSrc(data: string): string {
  if (data.startsWith("http") || data.startsWith("data:")) {
    return data;
  }
  return `data:image/jpeg;base64,${data}`;
}

interface SourceDocumentCardProps {
  sourceDocument: SourceDocument;
  ledgerEntries: LedgerEntry[];
  categories: EntryCategory[];
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

          {Object.entries(totalAmounts).map(([currency, total]) => (
            <span key={currency} className="text-sm font-bold text-text">
              <span className="text-xs text-muted mr-1">{currency}</span>
              {total.toFixed(2)}
            </span>
          ))}

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
