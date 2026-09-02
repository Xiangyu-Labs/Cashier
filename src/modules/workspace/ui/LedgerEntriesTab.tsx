import type { Ledger, LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { type PeriodParams } from "@/lib/period-utils";
import { openLedgerDetail } from "@/lib/navigation/ledger-detail-navigation";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useLedgerEntriesMutations } from "@/modules/ledger/hooks/useLedgerEntriesMutations";
import { type EntryFilters } from "@/modules/ledger/ui/EntryFilterPanel";
import type { LedgerAdvancedFilters } from "@/modules/workspace/initial-query-state";
import { LedgerEntriesToolbar } from "./LedgerEntriesToolbar";
import { LedgerEntriesStreamBody } from "./LedgerEntriesStreamBody";
import { LedgerEntriesOverlays } from "./LedgerEntriesOverlays";
import { useLedgerEntriesTabState } from "./useLedgerEntriesTabState";
import { useLedgerEntriesFilters } from "./useLedgerEntriesFilters";
import { useLedgerEntriesStreamData } from "@/modules/workspace/hooks/useLedgerEntriesStreamData";
import { useLedgerEntriesSelection } from "@/modules/workspace/hooks/useLedgerEntriesSelection";
import type { TabQueryStateReport } from "@/components/tab-query-state";
import { previewSourceDocumentDateImpactAction } from "@/modules/workspace/server-actions/date-impact";

interface LedgerEntriesTabProps {
  ledgerId: string;
  ledger?: Ledger;
  periodParams: PeriodParams;
  onFiltersChange: (filters: EntryFilters) => void;
  advancedFilters?: LedgerAdvancedFilters;
  collapseEntriesDefault?: boolean;
  timeZone?: string;
  onQueryStateChange?: (report: TabQueryStateReport) => void;
}

export function LedgerEntriesTab({
  ledgerId,
  ledger,
  periodParams,
  onFiltersChange,
  advancedFilters,
  collapseEntriesDefault = false,
  timeZone,
  onQueryStateChange,
}: LedgerEntriesTabProps) {
  const t = useTranslations("LedgerEntriesTab");
  const tCommon = useTranslations("Common");
  const tFilter = useTranslations("EntryFilterPanel");
  const { filters, startDateStr, endDateStr } = useLedgerEntriesFilters(
    periodParams,
    advancedFilters,
    timeZone
  );
  const mainCurrency = ledger?.settings.mainCurrency ?? "CNY";
  const [candidateReviewDocument, setCandidateReviewDocument] = useState<SourceDocument | null>(
    null
  );
  const [duplicateReviewDocument, setDuplicateReviewDocument] = useState<SourceDocument | null>(
    null
  );

  const {
    deleteConfirm,
    setDeleteConfirm,
    retrySourceDocument,
    setRetrySourceDocument,
    openSourceDocumentDeleteConfirm,
    closeRetrySourceDocument,
  } = useLedgerEntriesTabState();

  const { deleteEntry } = useLedgerEntriesMutations(ledgerId);

  const streamData = useLedgerEntriesStreamData({
    ledgerId,
    mainCurrency,
    filters,
    startDateStr,
    endDateStr,
    onQueryStateChange,
  });

  const selection = useLedgerEntriesSelection({
    ledgerId,
    streamGroups: streamData.streamGroups,
    periodParams,
    advancedFilters,
  });

  const handleViewSourceDetail = useCallback(
    (group: { sourceDocument: SourceDocument; ledgerEntries: LedgerEntry[] }) => {
      if (group.sourceDocument.status === "candidate_pending") {
        setCandidateReviewDocument(group.sourceDocument);
        return;
      }
      if (group.sourceDocument.status === "duplicate_pending") {
        setDuplicateReviewDocument(group.sourceDocument);
        return;
      }
      openLedgerDetail({
        type: "source-document",
        id: group.sourceDocument.id,
        ledgerId: group.sourceDocument.ledgerId,
      });
    },
    []
  );

  const handleViewLedgerEntry = useCallback((entry: LedgerEntry) => {
    openLedgerDetail({ type: "ledger-entry", id: entry.id, ledgerId: entry.ledgerId });
  }, []);

  const handleDeleteSourceConfirm = useCallback(
    (doc: SourceDocument) =>
      openSourceDocumentDeleteConfirm(doc.id, t("deleteConfirmTitle"), t("deleteConfirmDesc")),
    [openSourceDocumentDeleteConfirm, t]
  );

  const handleDeleteConfirmAction = useCallback(async () => {
    if (deleteConfirm.id == null || deleteConfirm.id === "" || deleteConfirm.type == null) return;
    if (deleteConfirm.type === "sourceDocument") {
      await selection.deleteSourceDocument.mutateAsync(deleteConfirm.id);
    } else if (deleteConfirm.type === "ledgerEntry") {
      await deleteEntry.mutateAsync(deleteConfirm.id);
    }
  }, [deleteConfirm, selection.deleteSourceDocument, deleteEntry]);

  const sentinelRef = useInfiniteScroll({
    hasNextPage: streamData.hasNextPage,
    isFetchingNextPage: streamData.isFetchingNextPage,
    isFetchNextPageError: streamData.isFetchNextPageError,
    fetchNextPage: streamData.fetchNextPage,
    rootMargin: "400px",
  });

  return (
    <>
      <LedgerEntriesToolbar
        isSelectionMode={selection.isSelectionMode}
        isAllSelected={selection.isAllSelected}
        hasMoreData={
          streamData.hasNextPage ||
          selection.allSourceDocumentIds.length > selection.selectableCount
        }
        selectedCount={selection.selectedIds.length}
        queryFingerprint={selection.queryFingerprint}
        selectedSourceDocumentIds={selection.selectedIds}
        selectedEntryIds={selection.selectedEntryIds}
        selectedDuplicateCount={selection.selectedDuplicateCount}
        onToggleSelectionMode={selection.handleToggleSelectionMode}
        onSelectAll={() => !selection.isBatchPending && selection.selectAll()}
        onClearSelection={() => !selection.isBatchPending && selection.clearSelection()}
        onUpdateDates={selection.handleBatchUpdateDates}
        onPreviewDateImpact={(sourceDocumentIds, entryIds) =>
          previewSourceDocumentDateImpactAction(ledgerId, {
            sourceDocumentIds,
            ledgerEntryIds: entryIds,
          })
        }
        isUpdatingDates={selection.batchUpdateDates.isPending}
        onRetry={async () => {
          await selection.batchRetry.mutateAsync(selection.selectedIds);
        }}
        onDelete={async () => {
          await selection.batchDelete.mutateAsync(selection.selectedIds);
        }}
        isRetrying={selection.batchRetry.isPending}
        isDeleting={selection.batchDelete.isPending}
        onKeepDuplicates={async () => {
          await selection.batchKeepDuplicates.mutateAsync({
            ids: selection.selectedDuplicateIds,
            preserveIds: selection.selectedOrdinaryIds,
          });
        }}
        onDiscardDuplicates={async () => {
          await selection.batchDiscardDuplicates.mutateAsync({
            ids: selection.selectedDuplicateIds,
            preserveIds: selection.selectedOrdinaryIds,
          });
        }}
        isKeepingDuplicates={selection.batchKeepDuplicates.isPending}
        isDiscardingDuplicates={selection.batchDiscardDuplicates.isPending}
        isProcessing={selection.isBatchPending}
        filters={filters}
        onFiltersChange={onFiltersChange}
        periodParams={periodParams}
        {...(!streamData.hasActiveFilters ? { totalPrefix: tFilter("total") } : {})}
        mainCurrency={mainCurrency}
        {...(streamData.filteredTotal === undefined
          ? {}
          : { filteredTotal: streamData.filteredTotal })}
        {...(timeZone != null ? { timeZone } : {})}
      />
      {streamData.streamTotalData?.unconvertedCount != null &&
      streamData.streamTotalData.unconvertedCount > 0 ? (
        <div
          role="status"
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
        >
          {tCommon("incompleteAccountingProjection")}
        </div>
      ) : null}

      <LedgerEntriesStreamBody
        isLoading={streamData.isLoading}
        streamGroups={streamData.streamGroups}
        mainCurrency={mainCurrency}
        filters={filters}
        onViewLedgerEntry={handleViewLedgerEntry}
        onViewSourceDetail={handleViewSourceDetail}
        onEditRetry={setRetrySourceDocument}
        onDeleteSourceConfirm={handleDeleteSourceConfirm}
        isSelectionMode={selection.isSelectionMode}
        selectedIds={selection.selectedIds}
        disableUnselected={selection.isSelectionLimitReached}
        onToggleSelection={selection.handleToggleSelection}
        timeZone={timeZone}
        collapseEntriesDefault={collapseEntriesDefault}
        hasNextPage={streamData.hasNextPage}
        isFetchingNextPage={streamData.isFetchingNextPage}
        isFetchNextPageError={streamData.isFetchNextPageError}
        fetchNextPage={streamData.fetchNextPage}
        sentinelRef={sentinelRef}
      />

      <LedgerEntriesOverlays
        deleteConfirm={deleteConfirm}
        onDeleteConfirmOpenChange={(open) => setDeleteConfirm((prev) => ({ ...prev, open }))}
        onDeleteConfirm={handleDeleteConfirmAction}
        deleteLabel={tCommon("delete")}
        retrySourceDocument={retrySourceDocument}
        onRetryDialogOpenChange={(open) => !open && closeRetrySourceDocument()}
        ledgerId={ledgerId}
        candidateReviewDocument={candidateReviewDocument}
        onCandidateReviewOpenChange={(open) => !open && setCandidateReviewDocument(null)}
        duplicateReviewDocument={duplicateReviewDocument}
        onDuplicateReviewOpenChange={(open) => !open && setDuplicateReviewDocument(null)}
        mainCurrency={mainCurrency}
      />
    </>
  );
}
