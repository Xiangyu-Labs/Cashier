import { SourceDocument, LedgerEntry, EntryCategory } from "@/types/api";
import { BillEntryItem } from "./BillEntryItem";
import { useState, useMemo } from "react";
import { Trash2, Check, ChevronDown, RefreshCw, MoreVertical, FileText, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProcessingStatus } from "@/components/ui/ProcessingStatus";
import { ImageViewer } from "@/components/ui/image-viewer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  return (
    <span className="text-sm font-bold text-text">
      <span className="text-xs text-muted mr-1">{mainCurrency}</span>
      <TotalValue entries={entries} mainCurrency={mainCurrency} />
    </span>
  );
}

function TotalValue({ entries, mainCurrency }: { entries: LedgerEntry[], mainCurrency: string }) {
  const totalAmount = entries.reduce((sum, entry) => sum + parseFloat(entry.amount), 0);
  const firstCurrency = entries[0]?.currency || mainCurrency;
  const firstDate = entries[0]?.entryDate || entries[0]?.createdAt;

  const { converted } = useConvertedAmount(totalAmount, firstCurrency, mainCurrency, firstDate);

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
  onViewDetails?: () => void;
  defaultExpanded?: boolean;
  onRetry?: () => Promise<void>;
  status: "queued" | "processing" | "completed" | "anomaly" | "pending"; // 'pending' legacy/fallback?
  anomalyCodes?: string[] | null;
  className?: string;
}

export function SourceDocumentCard({
  sourceDocument,
  ledgerEntries,
  categories: _,
  mainCurrency = "CNY",
  isConfirmed: _isConfirmed = false,
  onConfirm,
  onUpdateLedgerEntry: __,
  onDeleteLedgerEntry: ___,
  onDelete,
  onViewLedgerEntry,
  onViewDetails: _onViewDetails,
  defaultExpanded = false,
  onRetry,
  status,
  anomalyCodes,
  className,
}: SourceDocumentCardProps) {
  const t = useTranslations("SourceDocumentCard");
  const tError = useTranslations("AnomalyCode");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isItemsExpanded, setIsItemsExpanded] = useState(defaultExpanded);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  const showRawInput = status !== "completed" && isItemsExpanded;
  const showEntries = status !== "processing" && isItemsExpanded;

  const { sortedEntries } = useMemo(() => {
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

    return { sortedEntries: sorted };
  }, [ledgerEntries]);

  const { text, images } = useMemo(() => {
    return {
      text: sourceDocument.text,
      images: sourceDocument.imageUrls || [],
    };
  }, [sourceDocument]);

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
      <div
        className={cn(
          "px-4 py-3 bg-surface2/50 border-b border-border flex justify-between items-center transition-colors group",
          "cursor-pointer hover:bg-surface2"
        )}
        onClick={() => setIsItemsExpanded(!isItemsExpanded)}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform text-muted group-hover:text-text", isItemsExpanded && "rotate-180")} />
          <span className="text-sm font-medium text-muted truncate">
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
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
          {(ledgerEntries.length === 0 || status === "anomaly") && (
            <ProcessingStatus
              status={status === "anomaly" ? "error" : status}
              label={status === "anomaly" && anomalyCodes?.length ? anomalyCodes.map(c => tError(c)).join(", ") : undefined}
            />
          )}

          {!["queued", "processing", "anomaly"].includes(status) && (
            <SourceDocumentTotal
              entries={ledgerEntries}
              mainCurrency={mainCurrency}
            />
          )}

          <div className="flex items-center gap-1.5 ml-1">
            {/* Context Menu for Anomaly and Completed */}
            {(status === "anomaly" || status === "completed") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7 text-muted hover:text-text"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {_onViewDetails && (
                    <DropdownMenuItem onClick={_onViewDetails}>
                      <FileText className="mr-2 h-4 w-4" />
                      {t("viewDetails")}
                    </DropdownMenuItem>
                  )}
                  {status === "anomaly" && onRetry && (
                    <DropdownMenuItem onClick={handleRetry} disabled={isRetrying}>
                      <RefreshCw className={cn("mr-2 h-4 w-4", isRetrying && "animate-spin")} />
                      {tCommon("retry")}
                    </DropdownMenuItem>
                  )}
                  {status === "completed" && (
                    <DropdownMenuItem
                      disabled
                      title={t("shareComingSoon")}
                      className="opacity-50"
                    >
                      <Share2 className="mr-2 h-4 w-4" />
                      {t("share")}
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={onDelete}
                      className="text-danger focus:text-danger"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {tCommon("delete")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Confirm Button for Batch Confirmation - Keep here for visibility */}
            {(status === "completed" || status === "pending") && onConfirm && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleConfirm}
                disabled={isConfirming}
                className={cn(
                  "h-7 px-2 text-xs border-amber-600/30 hover:bg-amber-600/10 hover:text-amber-700 text-amber-600 dark:text-amber-400 dark:border-amber-400/30 dark:hover:text-amber-300"
                )}
                title={tCommon("confirm")}
              >
                {isConfirming ? (
                  <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                {tCommon("confirm")}
              </Button>
            )}
          </div>
        </div>
      </div>


      <AnimatePresence>
        {showRawInput && (
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

      <AnimatePresence>
        {isItemsExpanded && showEntries && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border divide-y divide-border p-3 space-y-3 bg-surface2/30 overflow-hidden"
          >
            {sortedEntries.map((entry) => (
              <BillEntryItem
                key={entry.id}
                ledgerEntry={entry}
                onView={() => onViewLedgerEntry?.(entry)}
                mainCurrency={mainCurrency}
                variant={
                  status === "anomaly"
                    ? "error"
                    : status === "pending"
                      ? "warning"
                      : status === "queued"
                        ? "info"
                        : "default"
                }
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <ImageViewer
        images={images}
        initialIndex={typeof selectedImageIndex === 'number' ? selectedImageIndex : 0}
        open={selectedImageIndex !== null}
        onOpenChange={(open) => !open && setSelectedImageIndex(null)}
      />
    </div >
  );
}
