import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { type SourceDocumentStatusType } from "@/modules/source-document/contracts";
import { SourceDocumentCard } from "@/modules/source-document/ui/SourceDocumentCard";
import { memo, useCallback } from "react";
import type { RendererProps, UnifiedStreamItem } from "./types";

interface UnifiedStreamItemRowProps {
  item: UnifiedStreamItem;
  mainCurrency: string;
  onViewLedgerEntry?: (entry: LedgerEntry) => void;
  onViewSourceDetail: RendererProps["onViewSourceDetail"];
  onViewSourceDetailIntent?: (doc: SourceDocument) => void;
  onEditRetry?: (doc: SourceDocument) => void;
  onEditRetryIntent?: () => void;
  onDeleteSourceConfirm: (doc: SourceDocument) => void;
  selectionMode: boolean;
  selected: boolean;
  selectionDisabled: boolean;
  onToggleSelection: (id: string) => void;
  getItemProps: () => Record<string, unknown>;
  readOnly: boolean;
  defaultExpanded: boolean;
  expanded?: boolean;
  onExpandedChange?: (sourceDocumentId: string, expanded: boolean) => void;
  isRetrying?: boolean;
  isCancelling?: boolean;
  isAbandoning?: boolean;
  onRetry?: (variables: { sourceDocumentId: string; expectedVersion: number }) => Promise<void>;
  onCancelProcessing?: (variables: {
    sourceDocumentId: string;
    expectedVersion: number;
  }) => Promise<void>;
  onAbandonCandidate?: (variables: {
    sourceDocumentId: string;
    expectedVersion: number;
  }) => Promise<void>;
}

export function StreamItemRow({
  item,
  props,
  readOnly,
  expanded,
  onExpandedChange,
}: {
  item: UnifiedStreamItem;
  props: RendererProps;
  readOnly: boolean;
  expanded?: boolean;
  onExpandedChange?: (sourceDocumentId: string, expanded: boolean) => void;
}) {
  const sourceDocumentId = item.sourceDocument.id;
  const recovery = props.recovery;
  return (
    <UnifiedStreamItemRow
      item={item}
      mainCurrency={props.mainCurrency}
      {...(props.onViewLedgerEntry != null ? { onViewLedgerEntry: props.onViewLedgerEntry } : {})}
      onViewSourceDetail={props.onViewSourceDetail}
      {...(props.onViewSourceDetailIntent != null
        ? { onViewSourceDetailIntent: props.onViewSourceDetailIntent }
        : {})}
      {...(props.onEditRetry != null ? { onEditRetry: props.onEditRetry } : {})}
      {...(props.onEditRetryIntent != null ? { onEditRetryIntent: props.onEditRetryIntent } : {})}
      onDeleteSourceConfirm={props.onDeleteSourceConfirm}
      selectionMode={props.isSelectionMode}
      selected={props.selectedIdSet.has(sourceDocumentId)}
      selectionDisabled={
        props.disableUnselected === true && !props.selectedIdSet.has(sourceDocumentId)
      }
      onToggleSelection={props.onToggleSelection}
      getItemProps={props.getItemProps}
      readOnly={readOnly}
      defaultExpanded={!props.collapseEntriesDefault}
      {...(expanded === undefined ? {} : { expanded })}
      {...(onExpandedChange == null ? {} : { onExpandedChange })}
      {...(recovery == null
        ? {}
        : {
            isRetrying: recovery.retryingIds.has(sourceDocumentId),
            isCancelling: recovery.cancellingIds.has(sourceDocumentId),
            isAbandoning: recovery.abandoningIds.has(sourceDocumentId),
            onRetry: recovery.retry,
            onCancelProcessing: recovery.cancelProcessing,
            onAbandonCandidate: recovery.abandonCandidate,
          })}
    />
  );
}

const UnifiedStreamItemRow = memo(function UnifiedStreamItemRow({
  item,
  mainCurrency,
  onViewLedgerEntry,
  onViewSourceDetail,
  onViewSourceDetailIntent,
  onEditRetry,
  onEditRetryIntent,
  onDeleteSourceConfirm,
  selectionMode,
  selected,
  selectionDisabled,
  onToggleSelection,
  getItemProps,
  readOnly,
  defaultExpanded,
  expanded,
  onExpandedChange,
  isRetrying = false,
  isCancelling = false,
  isAbandoning = false,
  onRetry,
  onCancelProcessing,
  onAbandonCandidate,
}: UnifiedStreamItemRowProps) {
  const sourceDocument = item.sourceDocument as SourceDocument;
  const ledgerEntries = item.ledgerEntries as LedgerEntry[];
  const handleExpandedChange = useCallback(
    (nextExpanded: boolean) => onExpandedChange?.(sourceDocument.id, nextExpanded),
    [onExpandedChange, sourceDocument.id]
  );
  const recoveryVariables = {
    sourceDocumentId: sourceDocument.id,
    expectedVersion: sourceDocument.version,
  };

  return (
    <div {...getItemProps()}>
      <SourceDocumentCard
        sourceDocument={item.sourceDocument}
        ledgerEntries={item.ledgerEntries}
        mainCurrency={mainCurrency}
        {...(onViewLedgerEntry != null ? { onViewLedgerEntry } : {})}
        onViewDetails={() => onViewSourceDetail({ sourceDocument, ledgerEntries })}
        {...(onViewSourceDetailIntent != null
          ? { onViewDetailsIntent: () => onViewSourceDetailIntent(sourceDocument) }
          : {})}
        {...(onEditRetry != null ? { onEditRetry: () => onEditRetry(sourceDocument) } : {})}
        {...(onEditRetryIntent != null ? { onEditRetryIntent } : {})}
        onDelete={() => onDeleteSourceConfirm(sourceDocument)}
        status={item.sourceDocument.status as SourceDocumentStatusType}
        anomalyReason={item.sourceDocument.anomalyReason}
        errorCode={item.sourceDocument.errorCode}
        selectionMode={selectionMode}
        isSelected={selected}
        selectionDisabled={selectionDisabled}
        onToggleSelect={() => onToggleSelection(sourceDocument.id)}
        readOnly={readOnly}
        defaultExpanded={defaultExpanded}
        {...(expanded === undefined ? {} : { expanded })}
        {...(onExpandedChange === undefined ? {} : { onExpandedChange: handleExpandedChange })}
        isRetrying={isRetrying}
        isCancelling={isCancelling}
        isAbandoning={isAbandoning}
        {...(onRetry == null || onCancelProcessing == null || onAbandonCandidate == null
          ? {}
          : {
              onRetry: () => onRetry(recoveryVariables),
              onCancelProcessing: () => onCancelProcessing(recoveryVariables),
              onAbandonCandidate: () => onAbandonCandidate(recoveryVariables),
            })}
      />
    </div>
  );
});
