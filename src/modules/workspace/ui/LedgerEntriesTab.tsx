import type { Ledger, LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGroup } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { type PeriodParams } from "@/lib/period-utils";
import {
  invalidateLedgerStats,
  invalidateSourceDocuments,
  invalidateTaskQueue,
  queryKeys,
} from "@/lib/query-keys";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { useLayoutTransition } from "@/hooks/use-layout-transition";
import { useSelection } from "@/hooks/use-selection";
import { getLedgerStatsAction } from "@/modules/ledger/actions";
import { useGroupedEntries, useLedgerEntriesMutations } from "@/modules/ledger/hooks";
import {
  useBatchSourceDocumentActions,
  useSourceDocumentCollection,
} from "@/modules/source-document/hooks";
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
  const filteredTotal = summaryData?.convertedTotal?.total ?? 0;
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
  const { groups, isLoading } = useSourceDocumentCollection(ledgerId, {
    dateRange: {
      ...(filters.startDate !== undefined ? { start: filters.startDate } : {}),
      ...(filters.endDate !== undefined ? { end: filters.endDate } : {}),
    },
    ...(filters.minAmount != null ? { minAmount: filters.minAmount } : {}),
    ...(filters.maxAmount != null ? { maxAmount: filters.maxAmount } : {}),
  });
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
  const { deleteSourceDocument, batchUpdateDates, batchDelete, batchRetry } =
    useBatchSourceDocumentActions(ledgerId, clearSelection);
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateTaskQueue(ledgerId) }),
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
  const handleDeleteConfirmAction = useCallback(() => {
    if (deleteConfirm.id == null || deleteConfirm.id === "" || deleteConfirm.type == null) return;
    if (deleteConfirm.type === "sourceDocument") deleteSourceDocument.mutate(deleteConfirm.id);
    else if (deleteConfirm.id === "ALL_ERRORS")
      batchDelete.mutate(groups.anomaly.map((g) => g.sourceDocument.id));
    else if (deleteConfirm.type === "ledgerEntry") deleteEntry.mutate(deleteConfirm.id);
    closeDeleteConfirm();
  }, [
    deleteConfirm,
    deleteSourceDocument,
    batchDelete,
    groups.anomaly,
    deleteEntry,
    closeDeleteConfirm,
  ]);
  const handleBatchUpdateDates = useCallback(
    (date: string) => batchUpdateDates.mutate({ ids: selectedIds, entryDate: date }),
    [batchUpdateDates, selectedIds]
  );
  const handleBatchDelete = useCallback(
    () => batchDelete.mutate(selectedIds),
    [batchDelete, selectedIds]
  );
  const handleBatchRetry = useCallback(
    () => batchRetry.mutate(selectedIds),
    [batchRetry, selectedIds]
  );
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
            onRetry={handleBatchRetry}
            onDelete={handleBatchDelete}
            isUpdatingDates={batchUpdateDates.isPending}
            isRetrying={batchRetry.isPending}
            isDeleting={batchDelete.isPending}
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
            <LedgerEntriesCompletedGroups
              groupedCompletedByDate={groupedCompletedByDate}
              mainCurrency={mainCurrency}
              onViewLedgerEntry={handleViewLedgerEntry}
              onViewSourceDetail={handleViewSourceDetail}
              onRetry={setRetrySourceDocument}
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
