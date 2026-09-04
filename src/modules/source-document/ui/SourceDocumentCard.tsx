import type { LedgerEntry } from "@/modules/ledger/contracts";
import type {
  SourceDocument,
  SourceDocumentLight,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";
import { memo, useCallback, useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { type SourceDocumentStatusType } from "@/modules/source-document/contracts";
import type { SupportedSourceDocumentAction } from "@/application/contracts";
import type { ApplicationErrorCode, ProcessingFailureCode } from "@/application/contracts";
import { EntryCardShell } from "@/components/entry-card-shell";
import { SelectableCardSurface } from "@/components/selectable-card-surface";
import { SourceDocumentCardHeader } from "./SourceDocumentCardHeader";
import { useSourceDocumentRecoveryMutations } from "@/modules/source-document/hooks/useSourceDocumentRecoveryMutations";
import { sortSourceDocumentEntries } from "./source-document-card.utils";
import { SourceDocumentCardEntries } from "./SourceDocumentCardEntries";

interface SourceDocumentCardProps {
  sourceDocument: SourceDocument | SourceDocumentLight | SourceDocumentListItemDto;
  ledgerEntries: LedgerEntry[];
  mainCurrency?: string;
  onDelete?: () => void;
  onViewLedgerEntry?: (ledgerEntry: LedgerEntry) => void;
  onViewDetails?: () => void;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onEditRetry?: () => void | Promise<void>;
  status: SourceDocumentStatusType;
  anomalyReason?: string | null;
  errorCode?: ApplicationErrorCode | ProcessingFailureCode | null | undefined;
  className?: string;
  selectionMode?: boolean;
  isSelected?: boolean;
  selectionDisabled?: boolean;
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
    version: props.sourceDocument.version,
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
  expanded,
  onExpandedChange,
  onEditRetry,
  status,
  anomalyReason,
  errorCode,
  className,
  selectionMode = false,
  isSelected = false,
  selectionDisabled = false,
  onToggleSelect,
  readOnly = false,
  recovery,
}: SourceDocumentCardProps & { recovery: RecoveryControls }) {
  const tCommon = useTranslations("Common");
  const tCard = useTranslations("SourceDocumentCard");
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const isExpanded = expanded ?? localExpanded;
  const toggleExpanded = useCallback(() => {
    const next = !isExpanded;
    if (expanded === undefined) setLocalExpanded(next);
    onExpandedChange?.(next);
  }, [expanded, isExpanded, onExpandedChange]);
  const contentId = `source-document-card-${useId().replaceAll(":", "")}`;
  const sortedEntries = useMemo(() => sortSourceDocumentEntries(ledgerEntries), [ledgerEntries]);
  const hasExpandableContent =
    (status === "completed" || status === "duplicate_pending") && sortedEntries.length > 0;
  const supportedActions: readonly SupportedSourceDocumentAction[] = readOnly
    ? []
    : sourceDocument.supportedActions;

  async function handleDirectRetry() {
    await recovery.retry();
  }

  return (
    <SelectableCardSurface
      selectionMode={selectionMode}
      selected={isSelected}
      disabled={selectionDisabled}
      selectionLabel={tCommon("selectItem", {
        item: sourceDocument.title?.trim() || tCard("untitled"),
      })}
      onToggleSelection={() => onToggleSelect?.()}
      indicatorPlacement="header"
      expandable={
        hasExpandableContent
          ? {
              isExpanded,
              onToggleExpanded: toggleExpanded,
              expandLabel: isExpanded ? tCard("collapse") : tCard("expand"),
            }
          : undefined
      }
    >
      <EntryCardShell
        data-testid="source-document-card-root"
        selected={selectionMode && isSelected}
        interactive={selectionMode}
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
          supportedActions={supportedActions}
          showActions={!readOnly}
          isExpanded={isExpanded}
          hasExpandableContent={hasExpandableContent}
          contentId={contentId}
          onToggleExpanded={toggleExpanded}
          onViewDetails={onViewDetails}
          onDirectRetry={handleDirectRetry}
          onCancelProcessing={recovery.cancelProcessing}
          onAbandonCandidate={recovery.abandonCandidate}
          onEditRetry={onEditRetry}
          onDelete={onDelete}
        />
        {isExpanded && hasExpandableContent ? (
          <div
            id={contentId}
            data-testid="source-document-card-body"
            className="animate-in overflow-hidden fade-in-0 slide-in-from-top-1 duration-[var(--motion-expand)] ease-[var(--motion-state-ease)] motion-reduce:animate-none"
          >
            <SourceDocumentCardEntries
              entries={sortedEntries}
              mainCurrency={mainCurrency}
              sourceDocumentEntryDate={sourceDocument.entryDate}
              {...(onViewLedgerEntry != null ? { onViewLedgerEntry } : {})}
            />
          </div>
        ) : null}
      </EntryCardShell>
    </SelectableCardSurface>
  );
}
