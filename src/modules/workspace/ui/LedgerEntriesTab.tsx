import type { Ledger, LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Loader2 } from "lucide-react";
import { type PeriodParams } from "@/lib/period-utils";
import { queryKeys } from "@/lib/query-keys";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useSelection } from "@/hooks/use-selection";
import { useLedgerEntriesMutations } from "@/modules/ledger/hooks";
import {
  useBatchSourceDocumentActions,
  useSourceDocumentStream,
} from "@/modules/source-document/hooks";
import { getStreamTotalAction } from "@/modules/source-document/actions";
import { useNotifyRevisionRefresh } from "@/modules/source-document/hooks/revision-state-refresh";
import { type EntryFilters } from "@/modules/ledger/ui";
import type { LedgerAdvancedFilters } from "@/modules/workspace/initial-query-state";
import type { StreamStatusPreset } from "@/modules/workspace/ledger-filter-state";
import { LedgerEntriesToolbar } from "./LedgerEntriesToolbar";
import { LedgerEntriesLoading } from "./LedgerEntriesLoading";
import { LedgerEntriesUnifiedGroups } from "./LedgerEntriesCompletedGroups";
import { LedgerEntriesOverlays } from "./LedgerEntriesOverlays";
import { useLedgerEntriesTabState } from "./useLedgerEntriesTabState";
import { buildStreamTotalQuery, useLedgerEntriesFilters } from "./useLedgerEntriesFilters";
import { patchExistingSourceDocumentDetail } from "@/modules/source-document/hooks/source-document-detail-cache";

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
}: LedgerEntriesTabProps) {
  const t = useTranslations("LedgerEntriesTab");
  const tCommon = useTranslations("Common");
  const tFilter = useTranslations("EntryFilterPanel");
  const notifyRefresh = useNotifyRevisionRefresh();
  const queryClient = useQueryClient();
  const pushModal = useModalStackStore((state) => state.push);
  const { filters, startDateStr, endDateStr } = useLedgerEntriesFilters(
    periodParams,
    advancedFilters,
    timeZone
  );
  const mainCurrency = ledger?.metadata?.settings?.mainCurrency ?? "CNY";
  const [candidateReviewDocument, setCandidateReviewDocument] = useState<SourceDocument | null>(
    null
  );

  const { input: streamTotalInput, statusesKey } = buildStreamTotalQuery(
    filters,
    startDateStr,
    endDateStr
  );
  const { data: streamTotalData } = useQuery({
    queryKey: queryKeys.sourceDocumentStreamTotal(ledgerId, {
      startDate: startDateStr,
      endDate: endDateStr,
      minAmount: filters.minAmount,
      maxAmount: filters.maxAmount,
      statuses: statusesKey,
      search: filters.search,
    }),
    queryFn: () => getStreamTotalAction(ledgerId, streamTotalInput),
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
  const { streamGroups, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, refresh } =
    useSourceDocumentStream(ledgerId, {
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
    });

  // Build groupedItems from completed groups for useGroupedEntries — no longer needed
  // Selection uses unified stream groups
  const allSourceDocumentIds = useMemo(
    () => streamGroups.flatMap((g) => g.items.map((i) => i.sourceDocument.id)),
    [streamGroups]
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
  } = useSelection({ allIds: allSourceDocumentIds });

  const { deleteSourceDocument, batchUpdateDates, batchDelete, batchRetry } =
    useBatchSourceDocumentActions(ledgerId, clearSelection, retainSelection);
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
    toggleSelectionMode();
  }, [toggleSelectionMode]);

  const handleViewSourceDetail = useCallback(
    (group: { sourceDocument: SourceDocument; ledgerEntries: LedgerEntry[] }) => {
      if (group.sourceDocument.status === "candidate_pending") {
        setCandidateReviewDocument(group.sourceDocument);
        return;
      }
      patchExistingSourceDocumentDetail(queryClient, group.sourceDocument);
      pushModal({
        type: "source-document",
        id: group.sourceDocument.id,
        ledgerId: group.sourceDocument.ledgerId,
      });
    },
    [pushModal, queryClient]
  );

  const handleViewLedgerEntry = useCallback(
    (entry: LedgerEntry) => {
      pushModal({ type: "ledger-entry", id: entry.id, ledgerId: entry.ledgerId });
    },
    [pushModal]
  );

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
    <PullToRefresh
      onRefresh={handleRefresh}
      header={
        <LedgerEntriesToolbar
          isSelectionMode={isSelectionMode}
          isAllSelected={isAllSelected}
          selectedCount={selectedIds.length}
          onToggleSelectionMode={handleToggleSelectionMode}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
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
          filters={filters}
          onFiltersChange={onFiltersChange}
          periodParams={periodParams}
          {...(!hasActiveFilters ? { totalPrefix: tFilter("total") } : {})}
          mainCurrency={mainCurrency}
          filteredTotal={filteredTotal}
          onResetFilters={onResetFilters}
          {...(onApplyPreset != null ? { onApplyPreset } : {})}
        />
      }
    >
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
                onToggleSelection={toggleSelection}
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
        mainCurrency={mainCurrency}
      />
    </PullToRefresh>
  );
}
