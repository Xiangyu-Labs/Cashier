import type { Ledger, LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { type PeriodParams } from "@/lib/period-utils";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { openLedgerDetail } from "../ledger-detail-navigation";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useSelection } from "@/hooks/use-selection";
import { useLedgerEntriesMutations } from "@/modules/ledger/hooks/useLedgerEntriesMutations";
import {
  useBatchSourceDocumentActions,
  useSourceDocumentStream,
} from "@/modules/source-document/hooks";
import { getStreamTotalAction } from "@/modules/source-document/actions";
import { useNotifyRevisionRefresh } from "@/modules/source-document/hooks/revision-state-refresh";
import { type EntryFilters } from "@/modules/ledger/ui/EntryFilterPanel";
import type { LedgerAdvancedFilters } from "@/modules/workspace/initial-query-state";
import type { StreamStatusPreset } from "@/modules/workspace/ledger-filter-state";
import { LedgerEntriesToolbar } from "./LedgerEntriesToolbar";
import { LedgerEntriesLoading } from "./LedgerEntriesLoading";
import { LedgerEntriesUnifiedGroups } from "./LedgerEntriesCompletedGroups";
import { LedgerEntriesOverlays } from "./LedgerEntriesOverlays";
import { useLedgerEntriesTabState } from "./useLedgerEntriesTabState";
import { useLedgerEntriesFilters } from "./useLedgerEntriesFilters";
import { buildStreamQueryDescriptor } from "@/modules/workspace/ledger-tab-query-descriptors";
import { patchExistingSourceDocumentDetail } from "@/modules/source-document/hooks/source-document-detail-cache";
import type { TabQueryStateReport } from "./tab-query-state";

interface LedgerEntriesTabProps {
  ledgerId: string;
  categories: EntryCategory[];
  ledger?: Ledger;
  periodParams: PeriodParams;
  onFiltersChange: (filters: EntryFilters) => void;
  advancedFilters?: LedgerAdvancedFilters;
  collapseEntriesDefault?: boolean;
  onApplyPreset?: (preset: StreamStatusPreset) => void;
  onResetFilters: () => void;
  timeZone?: string;
  onQueryStateChange?: (report: TabQueryStateReport) => void;
}

export function LedgerEntriesTab({
  ledgerId,
  categories,
  ledger,
  periodParams,
  onFiltersChange,
  advancedFilters,
  collapseEntriesDefault = false,
  onApplyPreset,
  onResetFilters,
  timeZone,
  onQueryStateChange,
}: LedgerEntriesTabProps) {
  const t = useTranslations("LedgerEntriesTab");
  const tCommon = useTranslations("Common");
  const tFilter = useTranslations("EntryFilterPanel");
  const notifyRefresh = useNotifyRevisionRefresh();
  const queryClient = useQueryClient();
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

  const streamQueryDescriptor = useMemo(
    () =>
      buildStreamQueryDescriptor({
        ledgerId,
        startDate: startDateStr,
        endDate: endDateStr,
        minAmount: filters.minAmount,
        maxAmount: filters.maxAmount,
        statuses: filters.statuses,
        search: filters.search,
      }),
    [
      endDateStr,
      filters.maxAmount,
      filters.minAmount,
      filters.search,
      filters.statuses,
      ledgerId,
      startDateStr,
    ]
  );
  const { data: streamTotalData } = useQuery({
    queryKey: streamQueryDescriptor.totalQueryKey,
    queryFn: () => getStreamTotalAction(ledgerId, streamQueryDescriptor.totalInput),
  });
  const filteredTotal = Number(streamTotalData?.total ?? 0);
  const hasActiveFilters =
    filters.startDate != null ||
    filters.endDate != null ||
    filters.minAmount != null ||
    filters.maxAmount != null ||
    (filters.statuses?.length ?? 0) > 0 ||
    (filters.search?.trim().length ?? 0) > 0;

  const {
    deleteConfirm,
    setDeleteConfirm,
    retrySourceDocument,
    setRetrySourceDocument,
    openSourceDocumentDeleteConfirm,
    closeRetrySourceDocument,
  } = useLedgerEntriesTabState();

  const { deleteEntry } = useLedgerEntriesMutations(ledgerId, categories);

  // Use the unified stream hook with paginated all-statuses results
  const {
    streamGroups,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refresh,
    queryKey,
    queryStatus,
    queryIsFetching,
  } = useSourceDocumentStream(ledgerId, {
    dateRange: {
      ...(filters.startDate !== undefined ? { start: filters.startDate } : {}),
      ...(filters.endDate !== undefined ? { end: filters.endDate } : {}),
    },
    ...(filters.minAmount != null ? { minAmount: filters.minAmount } : {}),
    ...(filters.maxAmount != null ? { maxAmount: filters.maxAmount } : {}),
    ...(filters.statuses != null && filters.statuses.length > 0
      ? { statuses: filters.statuses }
      : {}),
    ...(filters.search != null ? { search: filters.search } : {}),
    queryDescriptor: streamQueryDescriptor,
  });
  useEffect(() => {
    onQueryStateChange?.({
      ledgerId,
      tab: "stream",
      queryKey,
      status: queryStatus,
      isFetching: queryIsFetching,
    });
  }, [ledgerId, onQueryStateChange, queryIsFetching, queryKey, queryStatus]);

  // Build groupedItems from completed groups for useGroupedEntries — no longer needed
  // Selection uses unified stream groups
  const allSourceDocumentIds = useMemo(
    () => streamGroups.flatMap((g) => g.items.map((i) => i.sourceDocument.id)),
    [streamGroups]
  );
  const queryFingerprint = useMemo(
    () =>
      JSON.stringify({
        tab: "stream",
        period: periodParams,
        filters: advancedFilters,
      }),
    [advancedFilters, periodParams]
  );

  const {
    isSelectionMode,
    toggleSelectionMode,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    retainSelection,
    isAllSelected,
  } = useSelection({ allIds: allSourceDocumentIds, queryFingerprint });

  const {
    deleteSourceDocument,
    batchUpdateDates,
    batchDelete,
    batchRetry,
    batchKeepDuplicates,
    batchDiscardDuplicates,
  } = useBatchSourceDocumentActions(ledgerId, clearSelection, retainSelection);
  const selectedDuplicateIds = useMemo(() => {
    if (selectedIds.length === 0) return [];
    const statusById = new Map(
      streamGroups.flatMap((group) =>
        group.items.map((item) => [item.sourceDocument.id, item.sourceDocument.status] as const)
      )
    );
    return selectedIds.filter((id) => statusById.get(id) === "duplicate_pending");
  }, [selectedIds, streamGroups]);
  const selectedDuplicateCount = selectedDuplicateIds.length;
  const selectedOrdinaryIds = useMemo(() => {
    const duplicateIds = new Set(selectedDuplicateIds);
    return selectedIds.filter((id) => !duplicateIds.has(id));
  }, [selectedDuplicateIds, selectedIds]);
  const isBatchPending =
    batchUpdateDates.isPending ||
    batchDelete.isPending ||
    batchRetry.isPending ||
    batchKeepDuplicates.isPending ||
    batchDiscardDuplicates.isPending;
  useEffect(() => {
    document.documentElement.dataset.batchSelection = String(isSelectionMode);
    return () => {
      delete document.documentElement.dataset.batchSelection;
    };
  }, [isSelectionMode]);

  // C1: Targeted refresh — uses the bounded refresh path via coordinator
  const handleRefresh = useCallback(async () => {
    // Notify the coordinator of a change — triggers immediate refresh cycle
    notifyRefresh();
    // Also refresh the live ledger stats via the actual stream refresh
    if (refresh) {
      await refresh();
    }
  }, [notifyRefresh, refresh]);

  const handleToggleSelectionMode = useCallback(() => {
    if (isBatchPending) return;
    toggleSelectionMode();
  }, [isBatchPending, toggleSelectionMode]);

  const handleToggleSelection = useCallback(
    (id: string) => {
      if (!isBatchPending) toggleSelection(id);
    },
    [isBatchPending, toggleSelection]
  );

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
      patchExistingSourceDocumentDetail(queryClient, group.sourceDocument);
      openLedgerDetail({
        type: "source-document",
        id: group.sourceDocument.id,
        ledgerId: group.sourceDocument.ledgerId,
      });
    },
    [queryClient]
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
      await deleteSourceDocument.mutateAsync(deleteConfirm.id);
    } else if (deleteConfirm.type === "ledgerEntry") {
      await deleteEntry.mutateAsync(deleteConfirm.id);
    }
  }, [deleteConfirm, deleteSourceDocument, deleteEntry]);

  const handleBatchUpdateDates = useCallback(
    (date: string) => batchUpdateDates.mutate({ ids: selectedIds, entryDate: date }),
    [batchUpdateDates, selectedIds]
  );

  const sentinelRef = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    rootMargin: "400px",
  });

  return (
    <>
      <LedgerEntriesToolbar
        isSelectionMode={isSelectionMode}
        isAllSelected={isAllSelected}
        selectedCount={selectedIds.length}
        selectedDuplicateCount={selectedDuplicateCount}
        onToggleSelectionMode={handleToggleSelectionMode}
        onSelectAll={() => !isBatchPending && selectAll()}
        onClearSelection={() => !isBatchPending && clearSelection()}
        onUpdateDates={handleBatchUpdateDates}
        isUpdatingDates={batchUpdateDates.isPending}
        onRetry={async () => {
          await batchRetry.mutateAsync(selectedIds);
        }}
        onDelete={async () => {
          await batchDelete.mutateAsync(selectedIds);
        }}
        isRetrying={batchRetry.isPending}
        isDeleting={batchDelete.isPending}
        onKeepDuplicates={async () => {
          await batchKeepDuplicates.mutateAsync({
            ids: selectedDuplicateIds,
            preserveIds: selectedOrdinaryIds,
          });
        }}
        onDiscardDuplicates={async () => {
          await batchDiscardDuplicates.mutateAsync({
            ids: selectedDuplicateIds,
            preserveIds: selectedOrdinaryIds,
          });
        }}
        isKeepingDuplicates={batchKeepDuplicates.isPending}
        isDiscardingDuplicates={batchDiscardDuplicates.isPending}
        isProcessing={isBatchPending}
        filters={filters}
        onFiltersChange={onFiltersChange}
        periodParams={periodParams}
        {...(!hasActiveFilters ? { totalPrefix: tFilter("total") } : {})}
        mainCurrency={mainCurrency}
        filteredTotal={filteredTotal}
        onResetFilters={onResetFilters}
        onRefresh={handleRefresh}
        {...(onApplyPreset != null ? { onApplyPreset } : {})}
      />
      {streamTotalData?.unconvertedCount != null && streamTotalData.unconvertedCount > 0 ? (
        <div
          role="status"
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
        >
          {tCommon("incompleteAccountingProjection")}
        </div>
      ) : null}
      <div className="space-y-4">
        {isLoading ? (
          <LedgerEntriesLoading />
        ) : (
          <>
            {/* Unified stream groups — all states in a single chronological sequence */}
            {streamGroups.length > 0 && (
              <LedgerEntriesUnifiedGroups
                streamGroups={streamGroups}
                mainCurrency={mainCurrency}
                onViewLedgerEntry={handleViewLedgerEntry}
                onViewSourceDetail={handleViewSourceDetail}
                onEditRetry={setRetrySourceDocument}
                onDeleteSourceConfirm={handleDeleteSourceConfirm}
                isSelectionMode={isSelectionMode}
                selectedIds={selectedIds}
                onToggleSelection={handleToggleSelection}
                noRecordsText={tCommon("noRecords")}
                getItemProps={() => ({})}
                {...(timeZone != null ? { timeZone } : {})}
                collapseEntriesDefault={collapseEntriesDefault}
              />
            )}

            {/* No records state */}
            {!isLoading && streamGroups.length === 0 && (
              <div className="space-y-6 px-2 pt-2">
                <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-2">
                  <span>
                    {filters.search != null ||
                    filters.minAmount != null ||
                    filters.maxAmount != null ||
                    (filters.statuses?.length ?? 0) > 0
                      ? tFilter("noMatchingResults")
                      : tCommon("noRecords")}
                  </span>
                </div>
              </div>
            )}

            {/* Load completed history before the user reaches the list end. */}
            {hasNextPage && (
              <div ref={sentinelRef} className="flex h-12 justify-center py-4" aria-live="polite">
                {isFetchingNextPage && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("loadingMore")}
                  </span>
                )}
              </div>
            )}

            {/* End of list indicator when no more pages */}
            {!hasNextPage && streamGroups.length > 0 && (
              <div className="flex justify-center py-4">
                <span className="text-xs text-muted-foreground/50">- {t("noMore")} -</span>
              </div>
            )}
          </>
        )}
      </div>

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
