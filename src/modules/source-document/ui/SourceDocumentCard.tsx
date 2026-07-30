/* Hallmark · pre-emit critique: P4 H4 E4 S5 R5 V3 */
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";
import { memo } from "react";
import { type SourceDocumentStatusType } from "@/modules/source-document/contracts";
import type { SupportedSourceDocumentAction } from "@/application/contracts";
import type { ApplicationErrorCode, ProcessingFailureCode } from "@/application/contracts";
import { EntryCardShell } from "@/components/entry-card-shell";
import { SourceDocumentCardHeader } from "./SourceDocumentCardHeader";
import { useSourceDocumentRecoveryMutations } from "@/modules/source-document/hooks/useSourceDocumentRecoveryMutations";

interface SourceDocumentCardProps {
  sourceDocument: SourceDocument | SourceDocumentLight;
  ledgerEntries: LedgerEntry[];
  mainCurrency?: string;
  onDelete?: () => void;
  onViewDetails?: () => void;
  onEditRetry?: () => void | Promise<void>;
  status: SourceDocumentStatusType;
  anomalyReason?: string | null;
  errorCode?: ApplicationErrorCode | ProcessingFailureCode | null | undefined;
  className?: string;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  readOnly?: boolean;
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
  onViewDetails,
  onEditRetry,
  status,
  anomalyReason,
  errorCode,
  className,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  readOnly = false,
  recovery,
}: SourceDocumentCardProps & { recovery: RecoveryControls }) {
  const supportedActions: readonly SupportedSourceDocumentAction[] = readOnly
    ? []
    : "supportedActions" in sourceDocument
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
    <EntryCardShell
      data-testid="source-document-card-root"
      selected={isSelected}
      interactive={!selectionMode && onViewDetails != null}
      className={className}
      onClick={handleCardClick}
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
        onToggleSelect={onToggleSelect}
        onDirectRetry={handleDirectRetry}
        onCancelProcessing={recovery.cancelProcessing}
        onAbandonCandidate={recovery.abandonCandidate}
        onEditRetry={onEditRetry}
        onDelete={onDelete}
      />
    </EntryCardShell>
  );
}
