import { SourceDocument, SourceDocumentLight, LedgerEntry, EntryCategory } from "@/types/api";
import { LedgerEntryItem } from "@/components/entries";
import { useState, useMemo, memo } from "react";
import { Trash2, ChevronDown, RefreshCw, MoreVertical, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ProcessingStatus } from "@/components/ui/processing-status";
import { ImageViewer } from "@/components/ui/image-viewer";
import { parseDateString } from "@/lib/date-utils";
import { type SourceDocumentStatusType } from "@/features/source-document/server/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { parseAmount } from "@/lib/formatters";

function getSafeImageSrc(data: string): string {
  if (data.startsWith("http") || data.startsWith("data:") || data.startsWith("/api/uploads/")) {
    return data;
  }
  return `data:image/jpeg;base64,${data}`;
}

interface CurrencyBreakdown {
  currency: string;
  amount: number;
  convertedAmount?: number;
}

const SourceDocumentTotal = memo(function SourceDocumentTotal({ entries, mainCurrency }: { entries: LedgerEntry[], mainCurrency: string }) {
  const t = useTranslations("SourceDocumentCard");

  // Calculate subtotals by currency and total in main currency
  const { subtotalsByCurrency, totalInMainCurrency, breakdownData } = useMemo(() => {
    const groups: Record<string, number> = {};
    let mainCurrencyTotal = 0;

    entries.forEach(entry => {
      const curr = entry.currency || mainCurrency;
      const amount = parseAmount(entry.amount);
      groups[curr] = (groups[curr] || 0) + amount;

      // Use convertedAmount if available, otherwise use amount (for main currency)
      if (entry.convertedAmount) {
        mainCurrencyTotal += parseAmount(entry.convertedAmount);
      } else if (curr === mainCurrency) {
        mainCurrencyTotal += amount;
      }
    });

    const uniqueCurrencies = Object.keys(groups);

    // Build breakdown data
    const breakdown: CurrencyBreakdown[] = uniqueCurrencies.map((currency) => {
      // Calculate converted amount for this currency by summing all entries of this currency
      const convertedAmount = entries
        .filter(e => (e.currency || mainCurrency) === currency)
        .reduce((sum, e) => {
          if (e.convertedAmount) {
            return sum + parseAmount(e.convertedAmount);
          } else if ((e.currency || mainCurrency) === mainCurrency) {
            return sum + parseAmount(e.amount);
          }
          return sum;
        }, 0);

      return {
        currency,
        amount: groups[currency],
        convertedAmount,
      };
    });

    return { subtotalsByCurrency: groups, totalInMainCurrency: mainCurrencyTotal, breakdownData: breakdown };
  }, [entries, mainCurrency]);

  const uniqueCurrencies = Object.keys(subtotalsByCurrency);
  const hasMultipleCurrencies = uniqueCurrencies.length > 1;

  const formattedTotal = totalInMainCurrency.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // If only one currency, just show the total
  if (!hasMultipleCurrencies) {
    return (
      <span className="text-sm font-bold text-text">
        <span className="text-xs text-muted-foreground mr-1">{mainCurrency}</span>
        {formattedTotal}
      </span>
    );
  }

  // Multiple currencies: show total with expand option
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 text-sm font-bold text-text hover:text-primary transition-colors group"
          type="button"
        >
          <span className="text-xs text-muted-foreground mr-0.5">{mainCurrency}</span>
          {formattedTotal}
          <Coins className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3" align="end">
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Coins className="h-3 w-3" />
            {t("currencyBreakdown")}
          </div>
          <div className="space-y-1.5">
            {breakdownData.map(({ currency, amount, convertedAmount }) => (
              <div key={currency} className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{currency}</span>
                <div className="text-right">
                  <span className="font-medium">{amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  {currency !== mainCurrency && convertedAmount !== undefined && (
                    <span className="text-xs text-muted-foreground ml-1.5">
                      ≈ {mainCurrency} {convertedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t pt-2 mt-2 flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{t("convertedTotal")}</span>
            <span className="text-sm font-bold text-primary">
              {mainCurrency} {formattedTotal}
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});


interface SourceDocumentCardProps {
  sourceDocument: SourceDocument | SourceDocumentLight;
  ledgerEntries: LedgerEntry[];
  categories: EntryCategory[];
  mainCurrency?: string;
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
  onRetry?: () => void | Promise<void>;
  status: SourceDocumentStatusType;
  anomalyReason?: string | null;
  className?: string;
  // Selection mode
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export const SourceDocumentCard = memo(function SourceDocumentCard({
  sourceDocument,
  ledgerEntries,
  categories: _,
  mainCurrency = "CNY",
  onUpdateLedgerEntry: __,
  onDeleteLedgerEntry: ___,
  onDelete,
  onViewLedgerEntry,
  onViewDetails: _onViewDetails,
  defaultExpanded = false,
  onRetry,
  status,
  anomalyReason,
  className,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}: SourceDocumentCardProps) {
  const t = useTranslations("SourceDocumentCard");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const [isRetrying, setIsRetrying] = useState(false);
  const [isItemsExpanded, setIsItemsExpanded] = useState(defaultExpanded);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);


  const { sortedEntries } = useMemo(() => {
    const sorted = [...ledgerEntries].sort((a, b) => {
      const aOrder = a.category?.sortOrder ?? 999999;
      const bOrder = b.category?.sortOrder ?? 999999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return parseAmount(b.amount) - parseAmount(a.amount);
    });

    const totals: Record<string, number> = {};

    ledgerEntries.forEach((entry) => {
      if (entry.currency) {
        const amount = parseAmount(entry.amount);
        totals[entry.currency] = (totals[entry.currency] || 0) + amount;
      }
    });

    return { sortedEntries: sorted };
  }, [ledgerEntries]);

  const { text, images } = useMemo(() => {
    // imageUrls may not exist in SourceDocumentLight
    const imageUrls = 'imageUrls' in sourceDocument ? sourceDocument.imageUrls : undefined;
    return {
      text: sourceDocument.text,
      images: imageUrls || [],
    };
  }, [sourceDocument]);



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
    <div
      className={cn(
        "bg-surface rounded-xl shadow-sm border overflow-hidden mb-6 transition-all",
        isSelected ? "border-primary ring-1 ring-primary/20" : "border-border",
        className
      )}
      onClick={selectionMode ? onToggleSelect : undefined}
    >
      <div className="px-4 py-3 bg-surface2/50 border-b border-border flex items-center transition-all gap-1">
        {/* Selection checkbox */}
        {selectionMode && (
          <div
            className="mr-2 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggleSelect}
              className="h-5 w-5"
            />
          </div>
        )}

        {/* Left collapse button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsItemsExpanded(!isItemsExpanded);
          }}
          className="p-1.5 -ml-1.5 hover:bg-accent/10 rounded shrink-0 transition-colors"
          aria-label={isItemsExpanded ? t("collapse") : t("expand")}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform text-muted-foreground hover:text-text", isItemsExpanded && "rotate-180")} />
        </button>

        {/* Middle section - click to open details (non-selection mode) */}
        <div
          onClick={!selectionMode ? _onViewDetails : undefined}
          className={cn(
            "flex items-center gap-2 overflow-hidden flex-1 px-2 py-1 -my-1 rounded",
            _onViewDetails && !selectionMode && "cursor-pointer hover:bg-accent/5 active:bg-accent/10"
          )}
        >
          <span className="hidden sm:inline text-sm font-medium text-muted-foreground shrink-0">
            {(sourceDocument.entryDate
              ? parseDateString(sourceDocument.entryDate)
              : new Date(sourceDocument.createdAt)
            ).toLocaleDateString(locale, {
              month: "long",
              day: "numeric",
            })}
          </span>
          {status !== "processing" && status !== "queued" && status !== "failed" && sourceDocument.title && (
            <>
              <span className="hidden sm:inline text-muted-foreground/30 shrink-0">·</span>
              <span className="text-sm font-semibold text-text truncate">
                {sourceDocument.title}
              </span>
            </>
          )}
          {sourceDocument.type === "manual" && (
            <span className="text-xs text-muted-foreground bg-surface2 px-1.5 py-0.5 rounded shrink-0">
              {t("quickEntry")}
            </span>
          )}
        </div>

        {/* Right section - status, amount and menu */}
        <div className="flex items-center gap-2 shrink-0">
          {(ledgerEntries.length === 0 || status === "anomaly" || status === "failed") && (
            <ProcessingStatus
              status={(status === "anomaly" || status === "failed") ? "error" : status}
              label={status === "anomaly" && anomalyReason ? anomalyReason : undefined}
            />
          )}

          {!["queued", "processing", "anomaly", "failed"].includes(status) && (
            <SourceDocumentTotal
              entries={ledgerEntries}
              mainCurrency={mainCurrency}
            />
          )}

          <div className="flex items-center gap-1.5 ml-1">
            {/* Context Menu for all statuses */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7 text-muted-foreground hover:text-text"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {onRetry && sourceDocument.type !== "manual" && (
                  <DropdownMenuItem onClick={handleRetry} disabled={isRetrying}>
                    <RefreshCw className={cn("mr-2 h-4 w-4", isRetrying && "animate-spin")} />
                    {status === "queued" || status === "processing" || status === "failed" ? tCommon("retry") : t("editRetry")}
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


          </div>
        </div>
      </div>


      <AnimatePresence initial={false}>
        {isItemsExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            {/* Raw Input Section - only for non-completed status */}
            {status !== "completed" && (
              <div className="bg-surface2/30 border-b border-border">
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
                            alt={t("imageAlt", { index: idx + 1 })}
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
              </div>
            )}

            {/* Entries Section - only for completed status */}
            {status === "completed" && sortedEntries.length > 0 && (
              <div className="border-t border-border divide-y divide-border p-3 space-y-3 bg-surface2/30">
                {sortedEntries.map((entry) => (
                  <LedgerEntryItem
                    key={entry.id}
                    ledgerEntry={entry}
                    onView={() => onViewLedgerEntry?.(entry)}
                    mainCurrency={mainCurrency}
                    sourceDocumentEntryDate={sourceDocument.entryDate}
                    variant="default"
                  />
                ))}
              </div>
            )}

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
});
