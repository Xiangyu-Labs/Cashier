import { SourceDocument, LedgerEntry, EntryCategory } from "@/types/api";
import { BillEntryItem } from "@/features/ledger/components/BillEntryItem";
import { useState, useMemo, memo } from "react";
import { Trash2, ChevronDown, RefreshCw, MoreVertical, FileText, Share2 } from "lucide-react";
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
import { ShareDialog } from "@/components/share/ShareDialog";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";

import { useConvertedAmount } from "@/features/currency/client/hooks/useConvertedAmount";
import { useQueries } from "@tanstack/react-query";
import { deleteSourceDocumentAction } from "@/features/source-document/server/actions/main";
import { convertCurrencyAction } from "@/features/ledger/server/actions/currency";

function getSafeImageSrc(data: string): string {
  if (data.startsWith("http") || data.startsWith("data:")) {
    return data;
  }
  return `data:image/jpeg;base64,${data}`;
}

const SourceDocumentTotal = memo(function SourceDocumentTotal({ entries, mainCurrency }: { entries: LedgerEntry[], mainCurrency: string }) {
  return (
    <span className="text-sm font-bold text-text">
      <span className="text-xs text-muted-foreground mr-1">{mainCurrency}</span>
      <TotalValue entries={entries} mainCurrency={mainCurrency} />
    </span>
  );
});

const TotalValue = memo(function TotalValue({ entries, mainCurrency }: { entries: LedgerEntry[], mainCurrency: string }) {
  const { subtotalsByCurrency, entryDates } = useMemo(() => {
    const groups: Record<string, number> = {};
    const dates: Record<string, string> = {};
    entries.forEach(entry => {
      const curr = entry.currency || mainCurrency;
      groups[curr] = (groups[curr] || 0) + parseFloat(entry.amount);
      if (!dates[curr]) {
        dates[curr] = entry.entryDate || entry.createdAt;
      }
    });

    return {
      subtotalsByCurrency: groups,
      entryDates: dates,
    };
  }, [entries, mainCurrency]);

  const uniqueCurrencies = Object.keys(subtotalsByCurrency);

  const conversionQueries = useQueries({
    queries: uniqueCurrencies.map(currency => {
      const amount = subtotalsByCurrency[currency];
      const date = entryDates[currency];
      const dateStr = typeof date === 'string' ? date : (date as any).toISOString();

      return {
        queryKey: ["convert", amount, currency, mainCurrency, dateStr],
        queryFn: async () => {
          if (currency === mainCurrency) return { converted: amount };

          const res = await convertCurrencyAction(amount, currency, mainCurrency, dateStr);
          if (!res.success) throw new Error(res.error || "Conversion failed");
          return { converted: res.converted };
        },
        staleTime: 1000 * 60 * 60 * 24,
      };
    })
  });

  const totalInMainCurrency = conversionQueries.reduce((sum, query) => {
    return sum + (query.data?.converted ?? 0);
  }, 0);

  const isLoading = conversionQueries.some(q => q.isLoading);

  if (isLoading) {
    return <span className="animate-pulse">...</span>;
  }

  return totalInMainCurrency.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
});

interface SourceDocumentCardProps {
  sourceDocument: SourceDocument;
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
  status: "queued" | "processing" | "completed" | "anomaly";
  anomalyCodes?: string[] | null;
  className?: string;
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
  anomalyCodes,
  className,
}: SourceDocumentCardProps) {
  const t = useTranslations("SourceDocumentCard");
  const tError = useTranslations("AnomalyCode");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const [isRetrying, setIsRetrying] = useState(false);
  const [isItemsExpanded, setIsItemsExpanded] = useState(defaultExpanded);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);


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
          "px-4 py-3 bg-surface2/50 border-b border-border flex justify-between items-center transition-all group",
          "cursor-pointer hover:bg-surface2 active:scale-[0.995] active:brightness-95"
        )}
        onClick={() => setIsItemsExpanded(!isItemsExpanded)}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform text-muted-foreground group-hover:text-text", isItemsExpanded && "rotate-180")} />
          <span className="text-sm font-medium text-muted-foreground shrink-0">
            {new Date(sourceDocument.createdAt).toLocaleString(locale, {
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {status !== "processing" && status !== "queued" && sourceDocument.title && (
            <>
              <span className="text-muted-foreground/30 shrink-0">·</span>
              <span className="text-sm font-semibold text-text truncate">
                {sourceDocument.title}
              </span>
            </>
          )}
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
                {_onViewDetails && status === "completed" && (
                  <DropdownMenuItem onClick={_onViewDetails}>
                    <FileText className="mr-2 h-4 w-4" />
                    {t("viewDetails")}
                  </DropdownMenuItem>
                )}
                {onRetry && (
                  <DropdownMenuItem onClick={handleRetry} disabled={isRetrying}>
                    <RefreshCw className={cn("mr-2 h-4 w-4", isRetrying && "animate-spin")} />
                    {status === "queued" || status === "processing" ? tCommon("retry") : t("editRetry")}
                  </DropdownMenuItem>
                )}

                {status === "completed" && (
                  <DropdownMenuItem
                    onClick={() => setIsShareDialogOpen(true)}
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


          </div>
        </div>
      </div>

      <ShareDialog
        isOpen={isShareDialogOpen}
        onOpenChange={setIsShareDialogOpen}
        ledgerId={sourceDocument.ledgerId}
        sourceDocumentId={sourceDocument.id}
      />

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
              </div>
            )}

            {/* Entries Section - only for completed status (anomaly doesn't have entries) */}
            {status !== "processing" && status !== "anomaly" && sortedEntries.length > 0 && (
              <div className="border-t border-border divide-y divide-border p-3 space-y-3 bg-surface2/30">
                {sortedEntries.map((entry) => (
                  <BillEntryItem
                    key={entry.id}
                    ledgerEntry={entry}
                    onView={() => onViewLedgerEntry?.(entry)}
                    mainCurrency={mainCurrency}
                    variant={status === "queued" ? "info" : "default"}
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
