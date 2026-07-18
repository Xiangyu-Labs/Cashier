import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";
import { useState, useMemo, memo } from "react";
import { type SourceDocumentStatusType } from "@/modules/source-document/contracts";
import type { SupportedSourceDocumentAction } from "@/application/contracts";
import type { ApplicationErrorCode } from "@/application/contracts";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { getSourceDocumentPreview, sortSourceDocumentEntries } from "./source-document-card.utils";
import { SourceDocumentCardEntries } from "./SourceDocumentCardEntries";
import { SourceDocumentCardHeader } from "./SourceDocumentCardHeader";
import { SourceDocumentCardPreview } from "./SourceDocumentCardPreview";

interface SourceDocumentCardProps {
  sourceDocument: SourceDocument | SourceDocumentLight;
  ledgerEntries: LedgerEntry[];
  mainCurrency?: string;
  onDelete?: () => void;
  onViewLedgerEntry?: (ledgerEntry: LedgerEntry) => void;
  onViewDetails?: () => void;
  defaultExpanded?: boolean;
  onRetry?: () => void | Promise<void>;
  onDirectRetry?: () => void | Promise<void>;
  onEditRetry?: () => void | Promise<void>;
  onManualCorrection?: () => void | Promise<void>;
  onAcceptCandidate?: () => void | Promise<void>;
  onAbandonCandidate?: () => void | Promise<void>;
  status: SourceDocumentStatusType;
  anomalyReason?: string | null;
  errorCode?: ApplicationErrorCode | null | undefined;
  className?: string;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export const SourceDocumentCard = memo(function SourceDocumentCard({
  sourceDocument,
  ledgerEntries,
  mainCurrency = "CNY",
  onDelete,
  onViewLedgerEntry,
  onViewDetails: _onViewDetails,
  defaultExpanded = false,
  onRetry,
  onDirectRetry,
  onEditRetry,
  onManualCorrection,
  onAcceptCandidate,
  onAbandonCandidate,
  status,
  anomalyReason,
  errorCode,
  className,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}: SourceDocumentCardProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [isItemsExpanded, setIsItemsExpanded] = useState(defaultExpanded);

  const sortedEntries = useMemo(() => sortSourceDocumentEntries(ledgerEntries), [ledgerEntries]);
  const { text, images } = useMemo(
    () => getSourceDocumentPreview(sourceDocument),
    [sourceDocument]
  );

  const supportedActions: readonly SupportedSourceDocumentAction[] =
    "supportedActions" in sourceDocument
      ? (sourceDocument as SourceDocument).supportedActions ?? []
      : (sourceDocument as SourceDocumentLight).supportedActions ?? [];

  async function handleDirectRetry() {
    if (onDirectRetry == null && onRetry == null) return;
    setIsRetrying(true);
    try {
      if (onDirectRetry != null) {
        await onDirectRetry();
      } else if (onRetry != null) {
        await onRetry();
      }
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
        errorCode={errorCode}
        ledgerEntries={ledgerEntries}
        mainCurrency={mainCurrency}
        isExpanded={isItemsExpanded}
        isRetrying={isRetrying}
        selectionMode={selectionMode}
        isSelected={isSelected}
        supportedActions={supportedActions}
        onToggleExpanded={() => setIsItemsExpanded(!isItemsExpanded)}
        onViewDetails={_onViewDetails}
        onToggleSelect={onToggleSelect}
        onDirectRetry={handleDirectRetry}
        onEditRetry={onEditRetry ?? onRetry}
        onManualCorrection={onManualCorrection}
        onAcceptCandidate={onAcceptCandidate}
        onAbandonCandidate={onAbandonCandidate}
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
              <SourceDocumentCardPreview text={text} images={images} onViewDetails={_onViewDetails} />
            )}

            {status === "completed" && sortedEntries.length > 0 && (
              <SourceDocumentCardEntries
                entries={sortedEntries}
                mainCurrency={mainCurrency}
                sourceDocumentEntryDate={sourceDocument.entryDate}
                onViewLedgerEntry={onViewLedgerEntry}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
