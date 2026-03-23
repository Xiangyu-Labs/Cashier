import type { LedgerEntry, EntryCategory } from "@/modules/ledger/contracts";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";
import { useState, useMemo, memo } from "react";
import { type SourceDocumentStatusType } from "@/modules/source-document/contracts";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { LedgerEntryItem } from "./LedgerEntryItem";
import {
  getSafeImageSrc,
  getSourceDocumentPreview,
  sortSourceDocumentEntries,
} from "./source-document-card.utils";
import { SourceDocumentCardHeader } from "./SourceDocumentCardHeader";

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
  const [isRetrying, setIsRetrying] = useState(false);
  const [isItemsExpanded, setIsItemsExpanded] = useState(defaultExpanded);

  const sortedEntries = useMemo(() => sortSourceDocumentEntries(ledgerEntries), [ledgerEntries]);
  const { text, images } = useMemo(
    () => getSourceDocumentPreview(sourceDocument),
    [sourceDocument]
  );

  async function handleRetry() {
    if (onRetry == null) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <div
      data-testid="source-document-card-root"
      className={cn(
        "bg-surface rounded-xl shadow-sm border overflow-hidden mb-6 transition-all",
        isSelected ? "border-primary ring-1 ring-primary/20" : "border-border",
        className
      )}
      onClick={selectionMode ? onToggleSelect : undefined}
    >
      <SourceDocumentCardHeader
        sourceDocument={sourceDocument}
        status={status}
        anomalyReason={anomalyReason}
        ledgerEntries={ledgerEntries}
        mainCurrency={mainCurrency}
        isExpanded={isItemsExpanded}
        isRetrying={isRetrying}
        selectionMode={selectionMode}
        isSelected={isSelected}
        onToggleExpanded={() => setIsItemsExpanded(!isItemsExpanded)}
        onViewDetails={_onViewDetails}
        onToggleSelect={onToggleSelect}
        onRetry={handleRetry}
        onDelete={onDelete}
      />

      <AnimatePresence initial={false}>
        {isItemsExpanded && (
          <motion.div
            data-testid="source-document-card-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            {status !== "completed" && (
              <div className="bg-surface2/30 border-b border-border">
                <div className="p-4 space-y-3">
                  {images.length > 0 && (
                    <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-5">
                      {images.map((img, idx) => (
                        <div
                          key={idx}
                          className="relative aspect-square rounded-lg overflow-hidden border border-border bg-surface2 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => _onViewDetails?.()}
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

                  {text !== "" && (
                    <div className="text-text bg-surface2/30 p-3 rounded-md text-sm whitespace-pre-wrap leading-relaxed">
                      {text}
                    </div>
                  )}
                </div>
              </div>
            )}

            {status === "completed" && sortedEntries.length > 0 && (
              <div className="border-t border-border divide-y divide-border p-3 space-y-3 bg-surface2/30">
                {sortedEntries.map((entry) => (
                  <LedgerEntryItem
                    key={entry.id}
                    ledgerEntry={entry}
                    onView={() => onViewLedgerEntry?.(entry)}
                    mainCurrency={mainCurrency}
                    sourceDocumentEntryDate={sourceDocument.entryDate}
                    variant={
                      entry.category != null && !entry.category.isEditable ? "warning" : "default"
                    }
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
