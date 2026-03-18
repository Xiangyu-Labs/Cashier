import { useState, useCallback, useMemo } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  type LedgerEntry,
  type EntryCategory,
  type SourceDocument,
  type Ledger,
} from "@/types/api";
import { SourceDocumentCard } from "@/modules/source-document/ui";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { SourceDocumentEditRetryDialog } from "@/modules/source-document/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { EntryFilterPanel, type EntryFilters } from "../EntryFilterPanel";
import { useTranslations, useLocale } from "next-intl";
import { useSourceDocuments } from "@/modules/source-document/hooks/useSourceDocuments";
import { useBatchSourceDocumentActions } from "@/modules/source-document/hooks/useBatchSourceDocumentActions";
import type { SourceDocumentGroup } from "@/lib/serialization";
import { type SourceDocumentStatusType } from "@/modules/source-document";
import { useLayoutTransition } from "@/hooks/use-layout-transition";
import { invalidateLedgerStats, invalidateSourceDocuments, queryKeys } from "@/lib/query-keys";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { type PeriodParams, periodToDateRange } from "@/lib/period-utils";
import { useLedgerEntriesMutations } from "@/modules/ledger/hooks/useLedgerEntriesMutations";
import { getLedgerStatsAction } from "@/modules/ledger/actions";
import { formatDateTimeForApi, parseDateString } from "@/lib/date-utils";
import { useSelection } from "@/hooks/use-selection";
import { BatchActionToolbar } from "@/components/batch-action-toolbar";
import { Button } from "@/components/ui/button";
import { CheckSquare, X } from "lucide-react";
import { useGroupedEntries } from "@/modules/ledger/ui/useGroupedEntries";

interface LedgerEntriesTabProps {
  ledgerId: string;
  categories: EntryCategory[];
  ledger?: Ledger;
  periodParams: PeriodParams;
  onPeriodChange: (params: PeriodParams) => void;
  onFiltersChange: (filters: EntryFilters) => void;
  collapseEntriesDefault?: boolean;
}

export function LedgerEntriesTab({
  ledgerId,
  categories,
  ledger,
  periodParams,
  onPeriodChange,
  onFiltersChange,
  collapseEntriesDefault = false,
}: LedgerEntriesTabProps) {
  const t = useTranslations("LedgerEntriesTab");
  const tDetails = useTranslations("DetailsTab");
  const tCommon = useTranslations("Common");
  const tFilter = useTranslations("EntryFilterPanel");
  const locale = useLocale();
  const queryClient = useQueryClient();

  // Layout Transitions
  const { containerProps, getItemProps, layoutGroupId } = useLayoutTransition();

  // Convert periodParams to filters for data fetching
  const dateRange = useMemo(() => periodToDateRange(periodParams), [periodParams]);
  const filters: EntryFilters = useMemo(
    () => ({
      startDate:
        dateRange.startDate != null && dateRange.startDate !== ""
          ? parseDateString(dateRange.startDate)
          : undefined,
      endDate:
        dateRange.endDate != null && dateRange.endDate !== ""
          ? parseDateString(dateRange.endDate)
          : undefined,
    }),
    [dateRange]
  );

  const mainCurrency = ledger?.metadata?.settings?.mainCurrency ?? "CNY";
  const startDateStr = formatDateTimeForApi(filters.startDate) ?? undefined;
  const endDateStr = formatDateTimeForApi(filters.endDate) ?? undefined;

  const { data: summaryData } = useQuery({
    queryKey: queryKeys.summary(ledgerId, startDateStr, endDateStr, mainCurrency, null),
    queryFn: () =>
      getLedgerStatsAction(
        ledgerId,
        startDateStr !== "" ? startDateStr : undefined,
        endDateStr !== "" ? endDateStr : undefined,
        mainCurrency,
        {
          minAmount: filters.minAmount,
          maxAmount: filters.maxAmount,
        }
      ),
  });

  const filteredTotal = summaryData?.convertedTotal?.total ?? 0;

  const { updateEntry, deleteEntry, deleteSourceDocument, batchDeleteSourceDocuments } =
    useLedgerEntriesMutations(ledgerId, categories);

  // Modals State
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    type: "sourceDocument" | "batch" | "ledgerEntry" | null;
    id: string | null;
    title: string;
    description: string;
  }>({ open: false, type: null, id: null, title: "", description: "" });

  // Edit-Retry Dialog State (Keep this local as it's a specialized dialog)
  const [retrySourceDocument, setRetrySourceDocument] = useState<SourceDocument | null>(null);

  const pushModal = useModalStackStore((state) => state.push);

  // Unified Data Hook
  const { groups, isLoading } = useSourceDocuments(ledgerId, {
    dateRange: { start: filters.startDate, end: filters.endDate },
    minAmount: filters.minAmount ?? undefined,
    maxAmount: filters.maxAmount ?? undefined,
  });

  // Handlers
  const handleViewSourceDetail = useCallback(
    (group: { sourceDocument: SourceDocument; ledgerEntries: LedgerEntry[] }) => {
      pushModal({ type: "source-document", id: group.sourceDocument.id });
    },
    [pushModal]
  );

  const handleRetry = useCallback((doc: SourceDocument) => {
    setRetrySourceDocument(doc);
  }, []);

  const handleDeleteSourceConfirm = useCallback(
    (doc: SourceDocument) => {
      setDeleteConfirm({
        open: true,
        type: "sourceDocument",
        id: doc.id,
        title: t("deleteConfirmTitle"),
        description: t("deleteConfirmDesc"),
      });
    },
    [t]
  );

  const handleUpdateLedgerEntry = useCallback(
    (id: string, data: Partial<Omit<LedgerEntry, "amount">> & { amount?: number }) => {
      updateEntry.mutate({ ledgerEntryId: id, data });
    },
    [updateEntry]
  );

  const handleViewLedgerEntry = useCallback(
    (entry: LedgerEntry) => {
      pushModal({ type: "ledger-entry", id: entry.id });
    },
    [pushModal]
  );

  // Helper Action Handlers
  function handleDeleteConfirmAction() {
    if (deleteConfirm.id == null || deleteConfirm.id === "" || deleteConfirm.type == null) return;

    if (deleteConfirm.type === "sourceDocument") {
      deleteSourceDocument.mutate(deleteConfirm.id);
      setDeleteConfirm({ ...deleteConfirm, open: false });
    } else if (deleteConfirm.id === "ALL_ERRORS") {
      const ids = groups.anomaly.map((g) => g.sourceDocument.id);
      batchDeleteSourceDocuments.mutate(ids);
      setDeleteConfirm({ ...deleteConfirm, open: false });
    } else if (deleteConfirm.type === "ledgerEntry") {
      deleteEntry.mutate(deleteConfirm.id);
      setDeleteConfirm({ ...deleteConfirm, open: false });
    }
  }

  // Group entries by date
  const { groupedCompletedByDate, allSourceDocumentIds } = useGroupedEntries({
    completedGroups: groups.completed,
    locale,
    _mainCurrency: mainCurrency,
    tDetails,
  });

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) }),
    ]);
  }, [queryClient, ledgerId]);

  // Selection mode
  const {
    isSelectionMode,
    setSelectionMode,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isAllSelected,
  } = useSelection({ allIds: allSourceDocumentIds });

  // Batch actions
  const { batchUpdateDates, batchDelete, batchRetry } = useBatchSourceDocumentActions(
    ledgerId,
    clearSelection
  );

  // Handlers for batch actions
  const handleBatchUpdateDates = useCallback(
    (date: string) => {
      batchUpdateDates.mutate({ ids: selectedIds, entryDate: date });
    },
    [batchUpdateDates, selectedIds]
  );

  const handleBatchDelete = useCallback(() => {
    batchDelete.mutate(selectedIds);
  }, [batchDelete, selectedIds]);

  const handleBatchRetry = useCallback(() => {
    batchRetry.mutate(selectedIds);
  }, [batchRetry, selectedIds]);

  return (
    <LayoutGroup id={layoutGroupId}>
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="space-y-4" {...containerProps}>
          {/* Filter Panel */}
          <div className="px-2 mb-2 sm:mb-4 flex items-center gap-2">
            <Button
              variant={isSelectionMode ? "secondary" : "ghost"}
              size="icon"
              onClick={() => {
                if (isSelectionMode) {
                  clearSelection();
                } else {
                  setSelectionMode(true);
                }
              }}
              className="shrink-0 h-8 w-8"
            >
              {isSelectionMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
            </Button>
            <EntryFilterPanel
              filters={filters}
              onFiltersChange={onFiltersChange}
              periodParams={periodParams}
              onPeriodChange={onPeriodChange}
              showCategory={false}
              showCurrency={false}
              className="w-auto"
            />
            <span className="text-xs text-muted-foreground font-mono ml-auto">
              {tFilter("filteredTotal")} {mainCurrency} {filteredTotal.toFixed(2)}
            </span>
          </div>

          {/* Unified Loading State */}
          {isLoading ? (
            <div className="space-y-6 px-1 animate-pulse">
              {/* Date group skeletons */}
              {[1, 2, 3].map((dateGroupIdx) => (
                <div key={dateGroupIdx} className="space-y-2">
                  {/* Date header skeleton - matches real date header */}
                  <div className="py-2 px-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {/* Dot indicator */}
                      <div className="w-1.5 h-1.5 rounded-full bg-surface2" />
                      {/* Date text */}
                      <div className="h-3 w-24 bg-surface2 rounded" />
                    </div>
                    {/* Daily total */}
                    <div className="h-3 w-20 bg-surface2 rounded font-mono" />
                  </div>

                  {/* Source document cards for this date */}
                  {[1, 2].map((idx) => (
                    <div
                      key={idx}
                      className="bg-surface rounded-xl border border-border overflow-hidden"
                    >
                      {/* Card header skeleton - matches: expand icon + date + title + amount + more button */}
                      <div className="px-4 py-3 bg-surface2/50 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {/* Expand/collapse chevron */}
                          <div className="h-4 w-4 bg-border rounded shrink-0" />
                          {/* Date (e.g., "3月5日") */}
                          <div className="h-4 w-12 bg-border rounded shrink-0" />
                          {/* Title (e.g., "赫赫海鲜晚餐") */}
                          <div className="h-4 w-28 bg-border rounded" />
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {/* Amount */}
                          <div className="h-4 w-16 bg-border rounded font-mono" />
                          {/* More menu button */}
                          <div className="h-7 w-7 bg-border rounded" />
                        </div>
                      </div>
                      {/* Card content skeleton - entries */}
                      <div className="p-3 space-y-3 bg-surface2/30">
                        {[1, 2].map((entryIdx) => (
                          <div key={entryIdx} className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-3">
                              {/* Category/merchant icon */}
                              <div className="h-8 w-8 rounded-full bg-border" />
                              <div className="space-y-1.5">
                                {/* Entry title */}
                                <div className="h-4 w-24 bg-border rounded" />
                                {/* Category/subtitle */}
                                <div className="h-3 w-16 bg-border rounded" />
                              </div>
                            </div>
                            {/* Entry amount */}
                            <div className="h-4 w-14 bg-border rounded font-mono" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Completed Section - Only show processed entries */}
              <div className="space-y-6 px-2 pt-2">
                {groupedCompletedByDate.length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-2">
                    <span>{tCommon("noRecords")}</span>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {groupedCompletedByDate.map((dateGroup) => (
                      <motion.div
                        key={dateGroup.title}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-2"
                      >
                        {/* Date Header with indicator and daily total */}
                        <div className="py-2 px-2 flex items-center justify-between">
                          <h3 className="text-[10px] sm:text-xs font-medium text-muted-foreground flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary/50"></span>
                            {dateGroup.title}
                          </h3>
                          <span className="text-[10px] sm:text-xs font-mono font-medium text-muted-foreground">
                            {mainCurrency} {dateGroup.total.toFixed(2)}
                          </span>
                        </div>
                        {/* Documents for this date */}
                        <div className="space-y-4">
                          {dateGroup.items.map((group: SourceDocumentGroup) => (
                            <motion.div
                              key={group.sourceDocument.id}
                              layout
                              layoutId={group.sourceDocument.id}
                              {...getItemProps()}
                            >
                              <SourceDocumentCard
                                sourceDocument={group.sourceDocument}
                                ledgerEntries={group.ledgerEntries}
                                categories={categories}
                                mainCurrency={mainCurrency}
                                onUpdateLedgerEntry={handleUpdateLedgerEntry}
                                onViewLedgerEntry={handleViewLedgerEntry}
                                onViewDetails={() => handleViewSourceDetail(group)}
                                onRetry={() => handleRetry(group.sourceDocument)}
                                onDelete={() => handleDeleteSourceConfirm(group.sourceDocument)}
                                status={
                                  (group.sourceDocument.status ??
                                    "completed") as SourceDocumentStatusType
                                }
                                anomalyReason={group.sourceDocument.anomalyReason}
                                selectionMode={isSelectionMode}
                                isSelected={selectedIds.includes(group.sourceDocument.id)}
                                onToggleSelect={() => toggleSelection(group.sourceDocument.id)}
                                defaultExpanded={!collapseEntriesDefault}
                              />
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>

              {/* End of list indicator */}
              {groupedCompletedByDate.length > 0 && (
                <div className="flex justify-center py-4">
                  <span className="text-xs text-muted-foreground/50">— {t("noMore")} —</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Dialogs */}
        <ConfirmDialog
          open={deleteConfirm.open}
          onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
          title={deleteConfirm.title}
          description={deleteConfirm.description}
          onConfirm={handleDeleteConfirmAction}
          confirmLabel={tCommon("delete")}
          variant="destructive"
        />

        {/* Batch Action Toolbar */}
        <BatchActionToolbar
          selectedCount={selectedIds.length}
          totalCount={allSourceDocumentIds.length}
          isAllSelected={isAllSelected}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          onUpdateDates={handleBatchUpdateDates}
          onRetry={handleBatchRetry}
          onDelete={handleBatchDelete}
          isUpdatingDates={batchUpdateDates.isPending}
          isRetrying={batchRetry.isPending}
          isDeleting={batchDelete.isPending}
          mode="sourceDocuments"
        />

        {retrySourceDocument && (
          <SourceDocumentEditRetryDialog
            sourceDocument={retrySourceDocument}
            open={true}
            onOpenChange={(open) => !open && setRetrySourceDocument(null)}
            ledgerId={ledgerId}
          />
        )}
      </PullToRefresh>
    </LayoutGroup>
  );
}

export { useGroupedEntries } from "./useGroupedEntries";
