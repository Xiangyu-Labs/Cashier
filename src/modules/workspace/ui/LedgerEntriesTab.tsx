import type { Ledger, LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGroup } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2 } from "lucide-react";
import { type PeriodParams } from "@/lib/period-utils";
import {
  invalidateLedgerStats,
  invalidateSourceDocumentAttention,
  invalidateSourceDocumentCompleted,
  invalidateSourceDocumentCounts,
  queryKeys,
} from "@/lib/query-keys";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { useLayoutTransition } from "@/hooks/use-layout-transition";
import { useSelection } from "@/hooks/use-selection";
import { getLedgerStatsAction } from "@/modules/ledger/actions";
import { useGroupedEntries, useLedgerEntriesMutations } from "@/modules/ledger/hooks";
import { useBatchSourceDocumentActions,
  useSourceDocumentCollection,
} from "@/modules/source-document/hooks";
import {
  retrySourceDocumentAction,
  createManualCorrectionAction,
  acceptSourceDocumentCandidateAction,
  abandonSourceDocumentCandidateAction,
} from "@/modules/source-document/actions";
import { type EntryFilters } from "@/modules/ledger/ui";
import type { LedgerAdvancedFilters } from "@/modules/workspace/initial-query-state";
import { LedgerEntriesToolbar } from "./LedgerEntriesToolbar";
import { LedgerEntriesLoading } from "./LedgerEntriesLoading";
import { LedgerEntriesCompletedGroups } from "./LedgerEntriesCompletedGroups";
import { LedgerEntriesOverlays } from "./LedgerEntriesOverlays";
import { useLedgerEntriesTabState } from "./useLedgerEntriesTabState";
import { useLedgerEntriesFilters } from "./useLedgerEntriesFilters";

interface LedgerEntriesTabProps {
  ledgerId: string;
  categories: EntryCategory[];
  ledger?: Ledger;
  periodParams: PeriodParams;
  onPeriodChange: (params: PeriodParams) => void;
  onFiltersChange: (filters: EntryFilters) => void;
  advancedFilters?: LedgerAdvancedFilters;
  collapseEntriesDefault?: boolean;
}

export function LedgerEntriesTab({
  ledgerId,
  categories,
  ledger,
  periodParams,
  onPeriodChange,
  onFiltersChange,
  advancedFilters,
  collapseEntriesDefault = false,
}: LedgerEntriesTabProps) {
  const t = useTranslations("LedgerEntriesTab");
  const tDetails = useTranslations("DetailsTab");
  const tCommon = useTranslations("Common");
  const tFilter = useTranslations("EntryFilterPanel");
  const locale = useLocale();
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

  // Use the new collection hook with attention + paginated completed
  const {
    groups,
    attentionItems,
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
  });

  // Build groupedItems from completed groups for useGroupedEntries
  const { groupedCompletedByDate, allSourceDocumentIds } = useGroupedEntries({
    completedGroups: groups.completed,
    locale,
    _mainCurrency: mainCurrency,
    tDetails,
  });

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
      await retrySourceDocumentAction(ledgerId, doc.id);
      await queryClient.invalidateQueries({ predicate: invalidateSourceDocumentAttention(ledgerId) });
    },
    [ledgerId, queryClient]
  );

  const handleManualCorrection = useCallback(
    async (doc: SourceDocument) => {
      await createManualCorrectionAction(ledgerId, doc.id);
    },
    [ledgerId]
  );

  const handleAcceptCandidate = useCallback(
    async (doc: SourceDocument) => {
      if (doc.pendingRevisionId == null) return;
      await acceptSourceDocumentCandidateAction(ledgerId, doc.id, doc.pendingRevisionId);
    },
    [ledgerId]
  );

  const handleAbandonCandidate = useCallback(
    async (doc: SourceDocument) => {
      if (doc.pendingRevisionId == null) return;
      await abandonSourceDocumentCandidateAction(ledgerId, doc.id, doc.pendingRevisionId);
    },
    [ledgerId]
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

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Render attention document items inline
  const showAttentionSection = attentionItems.length > 0;

  return (
    <LayoutGroup id={layoutGroupId}>
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
            onPeriodChange={onPeriodChange}
            filteredTotalLabel={tFilter("filteredTotal")}
            mainCurrency={mainCurrency}
            filteredTotal={filteredTotal}
          />

          {isLoading ? (
            <LedgerEntriesLoading />
          ) : (
            <>
              {/* Attention section — items needing user action or processing */}
              {showAttentionSection && (
                <div className="space-y-2 px-2">
                  <div className="py-1 px-2">
                    <h3 className="text-[10px] sm:text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      {t("attentionSection")}
                    </h3>
                  </div>
                  {/* Render attention items using same card pattern as completed */}
                  <LedgerEntriesCompletedGroups
                    groupedCompletedByDate={[
                      {
                        title: t("attentionSection"),
                        total: 0,
                        items: groups.queued
                          .concat(groups.processing)
                          .concat(groups.anomaly)
                          .concat(groups.failed),
                      },
                    ]}
                    mainCurrency={mainCurrency}
                    onViewLedgerEntry={handleViewLedgerEntry}
                    onViewSourceDetail={handleViewSourceDetail}
                    onRetry={setRetrySourceDocument}
                    onDirectRetry={handleDirectRetry}
                    onEditRetry={setRetrySourceDocument}
                    onManualCorrection={handleManualCorrection}
                    onAcceptCandidate={handleAcceptCandidate}
                    onAbandonCandidate={handleAbandonCandidate}
                    onDeleteSourceConfirm={handleDeleteSourceConfirm}
                    isSelectionMode={isSelectionMode}
                    selectedIds={selectedIds}
                    onToggleSelection={toggleSelection}
                    collapseEntriesDefault={collapseEntriesDefault}
                    noRecordsText={tCommon("noRecords")}
                    noMoreText={t("noMore")}
                    getItemProps={getItemProps}
                  />
                </div>
              )}

              {/* Completed section with date grouping */}
              {groupedCompletedByDate.length > 0 && (
                <LedgerEntriesCompletedGroups
                  groupedCompletedByDate={groupedCompletedByDate}
                  mainCurrency={mainCurrency}
                  onViewLedgerEntry={handleViewLedgerEntry}
                  onViewSourceDetail={handleViewSourceDetail}
                  onRetry={setRetrySourceDocument}
                  onDirectRetry={handleDirectRetry}
                  onEditRetry={setRetrySourceDocument}
                  onManualCorrection={handleManualCorrection}
                  onAcceptCandidate={handleAcceptCandidate}
                  onAbandonCandidate={handleAbandonCandidate}
                  onDeleteSourceConfirm={handleDeleteSourceConfirm}
                  isSelectionMode={isSelectionMode}
                  selectedIds={selectedIds}
                  onToggleSelection={toggleSelection}
                  collapseEntriesDefault={collapseEntriesDefault}
                  noRecordsText={tCommon("noRecords")}
                  noMoreText={t("noMore")}
                  getItemProps={getItemProps}
                />
              )}

              {/* No records state - only when both attention and completed are empty */}
              {!showAttentionSection && groupedCompletedByDate.length === 0 && (
                <div className="space-y-6 px-2 pt-2">
                  <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-2">
                    <span>{tCommon("noRecords")}</span>
                  </div>
                </div>
              )}

              {/* Load-more button for completed history */}
              {hasNextPage && (
                <div className="flex justify-center py-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={isFetchingNextPage}
                    className="text-xs gap-1.5"
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t("loadingMore")}
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5" />
                        {t("loadMore")}
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* End of list indicator when no more pages */}
              {!hasNextPage && groupedCompletedByDate.length > 0 && (
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
    </LayoutGroup>
  );
}
