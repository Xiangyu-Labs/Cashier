import type { Ledger, LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Loader2 } from "lucide-react";
import { type PeriodParams } from "@/lib/period-utils";
import {
  invalidateLedgerStats,
  invalidateSourceDocumentAttention,
  invalidateSourceDocumentCompleted,
  invalidateSourceDocumentCounts,
  invalidateSourceDocuments,
  invalidateLedgerEntries,
  invalidateEntryCategories,
  queryKeys,
} from "@/lib/query-keys";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { useLayoutTransition } from "@/hooks/use-layout-transition";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useSelection } from "@/hooks/use-selection";
import { getLedgerStatsAction } from "@/modules/ledger/actions";
import { useLedgerEntriesMutations } from "@/modules/ledger/hooks";
import { useBatchSourceDocumentActions,
  useSourceDocumentCollection,
} from "@/modules/source-document/hooks";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  retrySourceDocumentAction,
  acceptSourceDocumentCandidateAction,
  abandonSourceDocumentCandidateAction,
} from "@/modules/source-document/actions";
import { type EntryFilters } from "@/modules/ledger/ui";
import type { LedgerAdvancedFilters } from "@/modules/workspace/initial-query-state";
import type { StreamStatusPreset } from "@/modules/workspace/ledger-filter-state";
import { LedgerEntriesToolbar } from "./LedgerEntriesToolbar";
import { LedgerEntriesLoading } from "./LedgerEntriesLoading";
import { LedgerEntriesUnifiedGroups } from "./LedgerEntriesCompletedGroups";
import { LedgerEntriesOverlays } from "./LedgerEntriesOverlays";
import { useLedgerEntriesTabState } from "./useLedgerEntriesTabState";
import { useLedgerEntriesFilters } from "./useLedgerEntriesFilters";

interface LedgerEntriesTabProps {
  ledgerId: string;
  categories: EntryCategory[];
  ledger?: Ledger;
  periodParams: PeriodParams;
  onFiltersChange: (filters: EntryFilters) => void;
  advancedFilters?: LedgerAdvancedFilters;
  collapseEntriesDefault?: boolean;
  onApplyPreset?: (preset: StreamStatusPreset) => void;
  statusSummaryRef?: React.RefObject<HTMLSpanElement | null> | undefined;
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
  statusSummaryRef,
}: LedgerEntriesTabProps) {
  const t = useTranslations("LedgerEntriesTab");
  const tCommon = useTranslations("Common");
  const tFilter = useTranslations("EntryFilterPanel");
  const tActions = useTranslations("CandidateAction");
  const queryClient = useQueryClient();
  const pushModal = useModalStackStore((state) => state.push);
  const { containerProps, getItemProps, layoutGroupId } = useLayoutTransition();
  const { filters, startDateStr, endDateStr } = useLedgerEntriesFilters(periodParams, advancedFilters);
  const mainCurrency = ledger?.metadata?.settings?.mainCurrency ?? "CNY";

  const { data: summaryData } = useQuery({
    queryKey: queryKeys.summary(ledgerId, startDateStr, endDateStr, mainCurrency, null),
    queryFn: () =>
      getLedgerStatsAction(
        ledgerId,
        startDateStr !== "" ? startDateStr : undefined,
        endDateStr !== "" ? endDateStr : undefined,
        mainCurrency,
        {
          ...(filters.minAmount !== undefined ? { minAmount: filters.minAmount } : {}),
          ...(filters.maxAmount !== undefined ? { maxAmount: filters.maxAmount } : {}),
        }
      ),
  });
  const filteredTotal = Number(summaryData?.convertedTotal?.total ?? 0);

  const {
    deleteConfirm,
    setDeleteConfirm,
    retrySourceDocument,
    setRetrySourceDocument,
    openSourceDocumentDeleteConfirm,
    closeDeleteConfirm,
    closeRetrySourceDocument,
  } = useLedgerEntriesTabState();

  const { deleteEntry } = useLedgerEntriesMutations(ledgerId, categories);

  // Mutations for stream card actions with proper cache invalidation, toast, and loading state
  const streamInvalidationPredicates = [
    invalidateSourceDocuments(ledgerId),
    invalidateLedgerEntries(ledgerId),
    invalidateLedgerStats(ledgerId),
    invalidateEntryCategories(ledgerId),
    invalidateSourceDocumentAttention(ledgerId),
    invalidateSourceDocumentCompleted(ledgerId),
    invalidateSourceDocumentCounts(ledgerId),
  ];

  const retryMutation = useLedgerMutation<void, SourceDocument>(ledgerId, {
    mutationFn: async (doc) => {
      await retrySourceDocumentAction(ledgerId, doc.id);
    },
    successMessage: null,
    errorMessage: null,
    invalidatePredicates: streamInvalidationPredicates,
  });

  const acceptCandidateMutation = useLedgerMutation<void, SourceDocument>(ledgerId, {
    mutationFn: async (doc) => {
      if (doc.pendingRevisionId == null) throw new Error("No pending revision");
      await acceptSourceDocumentCandidateAction(ledgerId, doc.id, doc.pendingRevisionId);
    },
    successMessage: tActions("acceptSuccess"),
    errorMessage: tActions("acceptError"),
    invalidatePredicates: streamInvalidationPredicates,
  });

  const abandonCandidateMutation = useLedgerMutation<void, SourceDocument>(ledgerId, {
    mutationFn: async (doc) => {
      if (doc.pendingRevisionId == null) throw new Error("No pending revision");
      await abandonSourceDocumentCandidateAction(ledgerId, doc.id, doc.pendingRevisionId);
    },
    successMessage: tActions("abandonSuccess"),
    errorMessage: tActions("abandonError"),
    invalidatePredicates: streamInvalidationPredicates,
  });

  // Use the new collection hook with attention + paginated completed
  const {
    streamGroups,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSourceDocumentCollection(ledgerId, {
    dateRange: {
      ...(filters.startDate !== undefined ? { start: filters.startDate } : {}),
      ...(filters.endDate !== undefined ? { end: filters.endDate } : {}),
    },
    ...(filters.minAmount != null ? { minAmount: filters.minAmount } : {}),
    ...(filters.maxAmount != null ? { maxAmount: filters.maxAmount } : {}),
    ...(filters.statuses != null && filters.statuses.length > 0 ? { statuses: filters.statuses } : {}),
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
    isAllSelected,
  } = useSelection({ allIds: allSourceDocumentIds });

  const { deleteSourceDocument, batchUpdateDates } =
    useBatchSourceDocumentActions(ledgerId, clearSelection);

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateSourceDocumentAttention(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateSourceDocumentCompleted(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateSourceDocumentCounts(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) }),
    ]);
  }, [queryClient, ledgerId]);

  const handleToggleSelectionMode = useCallback(() => {
    toggleSelectionMode();
  }, [toggleSelectionMode]);

  const handleViewSourceDetail = useCallback(
    (group: { sourceDocument: SourceDocument; ledgerEntries: LedgerEntry[] }) => {
      pushModal({
        type: "source-document",
        id: group.sourceDocument.id,
        ledgerId: group.sourceDocument.ledgerId,
      });
    },
    [pushModal]
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

  const handleDirectRetry = useCallback(
    async (doc: SourceDocument) => {
      await retryMutation.mutateAsync(doc);
    },
    [retryMutation]
  );

  const handleAcceptCandidate = useCallback(
    async (doc: SourceDocument) => {
      if (doc.pendingRevisionId == null) return;
      await acceptCandidateMutation.mutateAsync(doc);
    },
    [acceptCandidateMutation]
  );

  const handleAbandonCandidate = useCallback(
    async (doc: SourceDocument) => {
      if (doc.pendingRevisionId == null) return;
      await abandonCandidateMutation.mutateAsync(doc);
    },
    [abandonCandidateMutation]
  );

  const handleDeleteConfirmAction = useCallback(() => {
    if (deleteConfirm.id == null || deleteConfirm.id === "" || deleteConfirm.type == null) return;
    if (deleteConfirm.type === "sourceDocument") deleteSourceDocument.mutate(deleteConfirm.id);
    else if (deleteConfirm.type === "ledgerEntry") deleteEntry.mutate(deleteConfirm.id);
    closeDeleteConfirm();
  }, [
    deleteConfirm,
    deleteSourceDocument,
    deleteEntry,
    closeDeleteConfirm,
  ]);

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
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-4" {...containerProps}>
        <LedgerEntriesToolbar
          isSelectionMode={isSelectionMode}
          isAllSelected={isAllSelected}
            selectedCount={selectedIds.length}
            onToggleSelectionMode={handleToggleSelectionMode}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onUpdateDates={handleBatchUpdateDates}
            isUpdatingDates={batchUpdateDates.isPending}
            filters={filters}
            onFiltersChange={onFiltersChange}
            periodParams={periodParams}
            filteredTotalLabel={tFilter("filteredTotal")}
            mainCurrency={mainCurrency}
            filteredTotal={filteredTotal}
            statusSummaryRef={statusSummaryRef}
            {...(onApplyPreset != null ? { onApplyPreset } : {})}
          />

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
                  onRetry={setRetrySourceDocument}
                  onDirectRetry={handleDirectRetry}
                  onEditRetry={setRetrySourceDocument}
                  onAcceptCandidate={handleAcceptCandidate}
                  onAbandonCandidate={handleAbandonCandidate}
                  onDeleteSourceConfirm={handleDeleteSourceConfirm}
                  isSelectionMode={isSelectionMode}
                  selectedIds={selectedIds}
                  onToggleSelection={toggleSelection}
                  collapseEntriesDefault={collapseEntriesDefault}
                  noRecordsText={tCommon("noRecords")}
                  getItemProps={getItemProps}
                  isRetrying={retryMutation.isPending}
                  isAccepting={acceptCandidateMutation.isPending}
                  isAbandoning={abandonCandidateMutation.isPending}
                />
              )}

              {/* No records state */}
              {!isLoading && streamGroups.length === 0 && (
                <div className="space-y-6 px-2 pt-2">
                  <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-2">
                    <span>{tCommon("noRecords")}</span>
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
        />
      </PullToRefresh>
  );
}
