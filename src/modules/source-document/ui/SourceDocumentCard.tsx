/* Hallmark · pre-emit critique: P4 H4 E4 S5 R5 V3 */
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";
import { memo, useId, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type SourceDocumentStatusType } from "@/modules/source-document/contracts";
import type { SupportedSourceDocumentAction } from "@/application/contracts";
import type { ApplicationErrorCode, ProcessingFailureCode } from "@/application/contracts";
import { EntryCardShell } from "@/components/entry-card-shell";
import { SourceDocumentCardHeader } from "./SourceDocumentCardHeader";
import { useSourceDocumentRecoveryMutations } from "@/modules/source-document/hooks/useSourceDocumentRecoveryMutations";
import { getSourceDocumentPreview, sortSourceDocumentEntries } from "./source-document-card.utils";
import { SourceDocumentCardEntries } from "./SourceDocumentCardEntries";
import { SourceDocumentCardPreview } from "./SourceDocumentCardPreview";
import { EXPAND_TRANSITION, REDUCED_MOTION_TRANSITION } from "@/lib/motion";

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
  readOnly?: boolean;
  filteredSubtotal?: boolean;
  offlineImageUrls?: ReadonlyMap<string, string>;
}

interface RecoveryControls {
  isRetrying: boolean;
  isCancelling: boolean;
  isAbandoning: boolean;
  retry: () => Promise<unknown>;
  cancelProcessing: () => void;
  abandonCandidate: () => void;
}

const READ_ONLY_RECOVERY: RecoveryControls = {
  isRetrying: false,
  isCancelling: false,
  isAbandoning: false,
  retry: async () => undefined,
  cancelProcessing: () => {},
  abandonCandidate: () => {},
};

export const SourceDocumentCard = memo(function SourceDocumentCard(props: SourceDocumentCardProps) {
  return props.readOnly === true ? (
    <SourceDocumentCardBody {...props} recovery={READ_ONLY_RECOVERY} />
  ) : (
    <InteractiveSourceDocumentCard {...props} />
  );
});

function InteractiveSourceDocumentCard(props: SourceDocumentCardProps) {
  const recovery = useSourceDocumentRecoveryMutations({
    ledgerId: props.sourceDocument.ledgerId,
    sourceDocumentId: props.sourceDocument.id,
    ...(props.sourceDocument.pendingRevisionId == null
      ? {}
      : { revisionId: props.sourceDocument.pendingRevisionId }),
  });
  return <SourceDocumentCardBody {...props} recovery={recovery} />;
}

function SourceDocumentCardBody({
  sourceDocument,
  ledgerEntries,
  mainCurrency = "CNY",
  onDelete,
  onViewLedgerEntry,
  onViewDetails,
  defaultExpanded = true,
  onEditRetry,
  status,
  anomalyReason,
  errorCode,
  className,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  readOnly = false,
  filteredSubtotal = false,
  offlineImageUrls,
  recovery,
}: SourceDocumentCardProps & { recovery: RecoveryControls }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const contentId = `source-document-card-${useId().replaceAll(":", "")}`;
  const prefersReducedMotion = useReducedMotion();
  const sortedEntries = useMemo(() => sortSourceDocumentEntries(ledgerEntries), [ledgerEntries]);
  const preview = useMemo(() => getSourceDocumentPreview(sourceDocument), [sourceDocument]);
  const supportedActions: readonly SupportedSourceDocumentAction[] = readOnly
    ? []
    : "supportedActions" in sourceDocument
      ? ((sourceDocument as SourceDocument).supportedActions ?? [])
      : ((sourceDocument as SourceDocumentLight).supportedActions ?? []);

  async function handleDirectRetry() {
    await recovery.retry();
  }

  return (
    <EntryCardShell
      data-testid="source-document-card-root"
      selected={isSelected}
      className={className}
    >
      <SourceDocumentCardHeader
        sourceDocument={sourceDocument}
        status={status}
        anomalyReason={anomalyReason}
        errorCode={errorCode}
        ledgerEntries={ledgerEntries}
        mainCurrency={mainCurrency}
        isRetrying={recovery.isRetrying}
        isCancelling={recovery.isCancelling}
        isAbandoning={recovery.isAbandoning}
        selectionMode={selectionMode}
        isSelected={isSelected}
        supportedActions={supportedActions}
        showActions={!readOnly}
        filteredSubtotal={filteredSubtotal}
        isExpanded={isExpanded}
        contentId={contentId}
        onToggleExpanded={() => setIsExpanded((expanded) => !expanded)}
        onViewDetails={onViewDetails}
        onToggleSelect={onToggleSelect}
        onDirectRetry={handleDirectRetry}
        onCancelProcessing={recovery.cancelProcessing}
        onAbandonCandidate={recovery.abandonCandidate}
        onEditRetry={onEditRetry}
        onDelete={onDelete}
      />
      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            id={contentId}
            data-testid="source-document-card-body"
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={prefersReducedMotion ? REDUCED_MOTION_TRANSITION : EXPAND_TRANSITION}
            className="overflow-hidden"
          >
            {status === "completed" && sortedEntries.length > 0 ? (
              <SourceDocumentCardEntries
                entries={sortedEntries}
                mainCurrency={mainCurrency}
                sourceDocumentEntryDate={sourceDocument.entryDate}
                {...(onViewLedgerEntry != null ? { onViewLedgerEntry } : {})}
              />
            ) : status !== "completed" ? (
              <SourceDocumentCardPreview
                text={preview.text}
                images={preview.images}
                {...(onViewDetails != null ? { onViewDetails } : {})}
                {...(offlineImageUrls != null ? { offlineImageUrls } : {})}
                readOnly={readOnly}
              />
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </EntryCardShell>
  );
}
