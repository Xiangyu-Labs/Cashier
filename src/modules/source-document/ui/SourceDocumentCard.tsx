/* Hallmark · pre-emit critique: P4 H4 E4 S5 R5 V3 */
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";
import { useState, useMemo, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { type SourceDocumentStatusType } from "@/modules/source-document/contracts";
import type { SupportedSourceDocumentAction } from "@/application/contracts";
import type { ApplicationErrorCode, ProcessingFailureCode } from "@/application/contracts";
import { cn } from "@/lib/utils";
import { getSourceDocumentPreview, sortSourceDocumentEntries } from "./source-document-card.utils";
import { SourceDocumentCardEntries } from "./SourceDocumentCardEntries";
import { SourceDocumentCardHeader } from "./SourceDocumentCardHeader";
import { SourceDocumentCardPreview } from "./SourceDocumentCardPreview";
import type { DateProvenance } from "@/modules/source-document/stream-grouping";
import { useSourceDocumentRecoveryMutations } from "@/modules/source-document/hooks/useSourceDocumentRecoveryMutations";

interface SourceDocumentCardProps {
  sourceDocument: SourceDocument | SourceDocumentLight;
  ledgerEntries: LedgerEntry[];
  mainCurrency?: string;
  onDelete?: () => void;
  onViewLedgerEntry?: (ledgerEntry: LedgerEntry) => void;
  onViewDetails?: () => void;
  defaultExpanded?: boolean;
  onEditRetry?: () => void | Promise<void>;
  status: SourceDocumentStatusType;
  anomalyReason?: string | null;
  errorCode?: ApplicationErrorCode | ProcessingFailureCode | null | undefined;
  className?: string;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  /** Date provenance from the unified stream grouping model. */
  dateProvenance?: DateProvenance;
}

export const SourceDocumentCard = memo(function SourceDocumentCard({
  sourceDocument,
  ledgerEntries,
  mainCurrency = "CNY",
  onDelete,
  onViewLedgerEntry,
  onViewDetails,
  defaultExpanded = false,
  onEditRetry,
  status,
  anomalyReason,
  errorCode,
  className,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  dateProvenance,
}: SourceDocumentCardProps) {
  const [isItemsExpanded, setIsItemsExpanded] = useState(defaultExpanded);
  const recovery = useSourceDocumentRecoveryMutations({
    ledgerId: sourceDocument.ledgerId,
    sourceDocumentId: sourceDocument.id,
    ...(sourceDocument.pendingRevisionId == null
      ? {}
      : { revisionId: sourceDocument.pendingRevisionId }),
  });

  const sortedEntries = useMemo(() => sortSourceDocumentEntries(ledgerEntries), [ledgerEntries]);
  const { text, images } = useMemo(
    () => getSourceDocumentPreview(sourceDocument),
    [sourceDocument]
  );

  const supportedActions: readonly SupportedSourceDocumentAction[] =
    "supportedActions" in sourceDocument
      ? ((sourceDocument as SourceDocument).supportedActions ?? [])
      : ((sourceDocument as SourceDocumentLight).supportedActions ?? []);

  async function handleDirectRetry() {
    await recovery.retry();
  }

  const handleCardClick = () => {
    if (selectionMode) {
      onToggleSelect?.();
      return;
    }
    onViewDetails?.();
  };

  return (
    <div
      data-testid="source-document-card-root"
      className={cn(
        "mb-4 overflow-hidden rounded-lg border bg-surface shadow-[0_1px_2px_color-mix(in_srgb,var(--text),transparent_94%)] transition-[border-color,box-shadow]",
        isSelected ? "border-primary ring-1 ring-primary/20" : "border-border",
        !selectionMode &&
          onViewDetails != null &&
          "cursor-pointer hover:border-muted-foreground/40 hover:shadow-sm",
        className
      )}
      onClick={handleCardClick}
    >
      <SourceDocumentCardHeader
        sourceDocument={sourceDocument}
        status={status}
        anomalyReason={anomalyReason}
        errorCode={errorCode}
        ledgerEntries={ledgerEntries}
        mainCurrency={mainCurrency}
        isExpanded={isItemsExpanded}
        isRetrying={recovery.isRetrying}
        isCancelling={recovery.isCancelling}
        isAbandoning={recovery.isAbandoning}
        selectionMode={selectionMode}
        isSelected={isSelected}
        supportedActions={supportedActions}
        {...(dateProvenance !== undefined ? { dateProvenance } : {})}
        onToggleExpanded={() => setIsItemsExpanded(!isItemsExpanded)}
        onViewDetails={onViewDetails}
        onToggleSelect={onToggleSelect}
        onDirectRetry={handleDirectRetry}
        onCancelProcessing={recovery.cancelProcessing}
        onAbandonCandidate={recovery.abandonCandidate}
        onEditRetry={onEditRetry}
        onDelete={onDelete}
      />

      <AnimatePresence initial={false}>
        {isItemsExpanded && (
          <motion.div
            data-testid="source-document-card-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="relative z-content overflow-hidden"
          >
            {status !== "completed" && (
              <div onClick={(event) => event.stopPropagation()}>
                <SourceDocumentCardPreview
                  text={text}
                  images={images}
                  onViewDetails={onViewDetails}
                />
              </div>
            )}

            {status === "completed" && sortedEntries.length > 0 && (
              <div onClick={(event) => event.stopPropagation()}>
                <SourceDocumentCardEntries
                  entries={sortedEntries}
                  mainCurrency={mainCurrency}
                  sourceDocumentEntryDate={sourceDocument.entryDate}
                  onViewLedgerEntry={onViewLedgerEntry}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
