"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Ledger } from "@/modules/ledger/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { useModalStackStore } from "@/lib/store/modal-stack";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
} from "@/lib/query-keys";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import {
  useDetailsTabData,
  useDetailsTabGrouping,
  useEntryMutations,
} from "@/modules/ledger/hooks";
import { EntryFilterPanel, LedgerEntryCard, LedgerEntryDetailModal } from "@/modules/ledger/ui";
import type { EntryFilters } from "@/modules/ledger/ui";
import { DetailsToolbar } from "./DetailsToolbar";
import { EmptyState } from "./EmptyState";
import { EntryGroupHeader } from "./EntryGroupHeader";
import { useDetailsTabState } from "./useDetailsTabState";
import { useDetailsTabFilters } from "./useDetailsTabFilters";
import type { EntryCategory } from "@/modules/ledger/contracts";
import type { PeriodParams } from "@/lib/period-utils";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { CheckSquare, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSelection } from "@/hooks/use-selection";
import { LedgerEntriesBatchActionToolbar } from "@/modules/ledger/ui/batch-action-toolbar";
import {
  batchDeleteLedgerEntriesAction,
  batchUpdateLedgerEntriesAction,
  batchUpdateLedgerEntryDatesAction,
  previewBatchLedgerEntryDateAction,
} from "@/modules/ledger/actions";
import { toast } from "sonner";

interface DetailsTabProps {
  ledgerId: string;
  categories: EntryCategory[];
  ledger?: Ledger;
  periodParams: PeriodParams;
  onFiltersChange: (filters: EntryFilters) => void;
  advancedFilters: {
    categoryId?: string | null;
    currency?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
    search?: string | null;
  };
  onResetFilters: () => void;
  timeZone?: string;
}

export function DetailsTab({
  ledgerId,
  categories,
  ledger,
  periodParams,
  onFiltersChange,
  advancedFilters,
  onResetFilters,
  timeZone,
}: DetailsTabProps) {
  const t = useTranslations("DetailsTab");
  const tCommon = useTranslations("Common");
  const tFilter = useTranslations("EntryFilterPanel");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const push = useModalStackStore((state) => state.push);

  // State management
  const {
    selectedLedgerEntry,
    setSelectedLedgerEntry,
    isDetailModalOpen,
    handleViewEntry,
    handleCloseDetail,
  } = useDetailsTabState();
  const selectedSourceDocumentId = selectedLedgerEntry?.sourceDocumentId;

  // Data fetching
  const { entries, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, monthStats } =
    useDetailsTabData({
      ledgerId,
      periodParams,
      advancedFilters,
      ...(timeZone != null ? { timeZone } : {}),
      ...(ledger !== undefined ? { ledger } : {}),
    });

  // Grouping
  const { groupedItems } = useDetailsTabGrouping(entries, timeZone);
  const allEntryIds = useMemo(() => entries.map((entry) => entry.id), [entries]);
  const {
    selectedIds,
    isSelectionMode,
    isAllSelected,
    toggleSelectionMode,
    toggleSelection,
    selectAll,
    clearSelection,
    retainSelection,
  } = useSelection({ allIds: allEntryIds });
  useEffect(() => {
    document.documentElement.dataset.batchSelection = String(isSelectionMode);
    return () => {
      delete document.documentElement.dataset.batchSelection;
    };
  }, [isSelectionMode]);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateImpact, setDateImpact] = useState<Awaited<
    ReturnType<typeof previewBatchLedgerEntryDateAction>
  > | null>(null);

  // Filters
  const { filters } = useDetailsTabFilters({
    periodParams,
    advancedFilters,
    ...(timeZone != null ? { timeZone } : {}),
  });

  // Mutations
  const { updateEntry, deleteEntry } = useEntryMutations({
    ledgerId,
    categories,
    selectedLedgerEntry,
    setSelectedLedgerEntry,
  });

  const invalidateAfterBatch = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateLedgerEntries(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateCalendar(ledgerId) }),
    ]);
  }, [ledgerId, queryClient]);

  const batchUpdate = useMutation({
    mutationFn: (data: { categoryId?: string | null; currency?: string | null }) =>
      batchUpdateLedgerEntriesAction(ledgerId, selectedIds, data),
    onSuccess: (result) => {
      toast.success(t("batchUpdated", { count: result.affectedCount }));
      clearSelection();
    },
    onError: () => toast.error(tCommon("error")),
    onSettled: invalidateAfterBatch,
  });
  const batchDelete = useMutation({
    mutationFn: () => batchDeleteLedgerEntriesAction(ledgerId, selectedIds),
    onSuccess: (result) => {
      const unresolved = [...result.skipped, ...result.failed].map((item) => item.id);
      if (unresolved.length > 0) retainSelection(unresolved);
      else clearSelection();
      toast.success(t("batchDeleted", { count: result.succeededIds.length }));
      if (unresolved.length > 0) toast.warning(t("batchUnresolved", { count: unresolved.length }));
      setDeleteDialogOpen(false);
    },
    onError: () => toast.error(tCommon("deleteFailed")),
    onSettled: invalidateAfterBatch,
  });
  const previewDate = useMutation({
    mutationFn: () => previewBatchLedgerEntryDateAction(ledgerId, selectedIds),
    onSuccess: (impact) => {
      setDateImpact(impact);
      setDateDialogOpen(true);
    },
    onError: () => toast.error(tCommon("error")),
  });
  const updateDates = useMutation({
    mutationFn: () => batchUpdateLedgerEntryDatesAction(ledgerId, selectedIds, selectedDate),
    onSuccess: () => {
      toast.success(t("dateUpdated"));
      clearSelection();
      setDateDialogOpen(false);
    },
    onError: () => toast.error(tCommon("error")),
    onSettled: invalidateAfterBatch,
  });
  const batchPending =
    batchUpdate.isPending ||
    batchDelete.isPending ||
    previewDate.isPending ||
    updateDates.isPending;

  // Infinite scroll
  const sentinelRef = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  // Handlers
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateLedgerEntries(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) }),
    ]);
  }, [queryClient, ledgerId]);

  return (
    <PullToRefresh
      onRefresh={handleRefresh}
      header={
        <>
          <DetailsToolbar
            {...(!isSelectionMode
              ? {
                  totalLabel: formatCurrencyAmount(
                    Number(monthStats.mainTotal),
                    monthStats.mainCurrency,
                    locale
                  ),
                }
              : {})}
            batchActions={
              isSelectionMode ? (
                <LedgerEntriesBatchActionToolbar
                  variant="inline"
                  selectedCount={selectedIds.length}
                  totalCount={entries.length}
                  isAllSelected={isAllSelected}
                  hasMoreData={hasNextPage}
                  onSelectAll={selectAll}
                  onClearSelection={clearSelection}
                  categories={categories}
                  preferredCurrencies={ledger?.metadata?.settings?.currencies ?? []}
                  onChangeCategory={async (categoryId) => {
                    await batchUpdate.mutateAsync({ categoryId });
                  }}
                  onChangeCurrency={async (currency) => {
                    await batchUpdate.mutateAsync({ currency });
                  }}
                  onChangeDate={() => previewDate.mutate()}
                  onDelete={() => setDeleteDialogOpen(true)}
                  isProcessing={batchPending}
                />
              ) : undefined
            }
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSelectionMode}
              className="h-8 w-8"
              aria-label={isSelectionMode ? t("cancelSelect") : t("select")}
            >
              {isSelectionMode ? (
                <ArrowLeft className="h-4 w-4" />
              ) : (
                <CheckSquare className="h-4 w-4" />
              )}
            </Button>
            {!isSelectionMode && (
              <EntryFilterPanel
                filters={filters}
                onFiltersChange={onFiltersChange}
                periodParams={periodParams}
                categories={categories}
                preferredCurrencies={ledger?.metadata?.settings?.currencies ?? []}
                showStatus={false}
                className="flex-1 sm:flex-none"
                onResetFilters={onResetFilters}
              />
            )}
          </DetailsToolbar>
        </>
      }
    >
      <div className="space-y-4">
        {/* Entry Groups */}
        <div className="space-y-6 pt-2">
          {groupedItems.map((group) => (
            <div key={group.title} className="ledger-list-group space-y-2">
              <EntryGroupHeader
                title={group.title}
                totalLabel={formatCurrencyAmount(group.total, monthStats.mainCurrency, locale)}
              />
              <div className="space-y-4 px-2">
                {group.items.map((entry) => (
                  <LedgerEntryCard
                    key={entry.id}
                    ledgerEntry={entry}
                    categories={categories}
                    {...(ledger?.metadata?.settings?.mainCurrency !== undefined
                      ? { mainCurrency: ledger.metadata.settings.mainCurrency }
                      : {})}
                    onView={handleViewEntry}
                    selectionMode={isSelectionMode}
                    isSelected={selectedIds.includes(entry.id)}
                    onToggleSelect={toggleSelection}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Loading State */}
          {isLoading && (
            <div className="space-y-4 px-2 animate-pulse">
              {[1, 2, 3].map((idx) => (
                <div key={idx} className="bg-surface rounded-xl border border-border p-4 h-20" />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && entries.length === 0 && (
            <EmptyState
              title={
                advancedFilters.search != null ||
                advancedFilters.categoryId != null ||
                advancedFilters.currency != null ||
                advancedFilters.minAmount != null ||
                advancedFilters.maxAmount != null
                  ? tFilter("noMatchingResults")
                  : tCommon("noRecords")
              }
            />
          )}

          {/* Infinite Scroll Sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <span className="text-sm text-muted-foreground">{tCommon("loading")}</span>
            </div>
          )}
          {!hasNextPage && entries.length > 0 && (
            <div className="flex justify-center py-4">
              <span className="text-xs text-muted-foreground/50">— {t("noMore")} —</span>
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {selectedLedgerEntry && (
          <LedgerEntryDetailModal
            ledgerEntry={selectedLedgerEntry}
            categories={categories}
            open={isDetailModalOpen}
            onClose={handleCloseDetail}
            onUpdate={async (data) => {
              await updateEntry.mutateAsync({
                ledgerEntryId: selectedLedgerEntry.id,
                data,
              });
            }}
            onDelete={async () => {
              await deleteEntry.mutateAsync(selectedLedgerEntry.id);
            }}
            {...(selectedSourceDocumentId != null && selectedSourceDocumentId !== ""
              ? {
                  onViewSourceDocument: () =>
                    push({
                      type: "source-document",
                      id: selectedSourceDocumentId,
                      ledgerId,
                    }),
                }
              : {})}
          />
        )}

        <ConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title={t("deleteSelectedTitle")}
          description={t("deleteSelectedDescription", { count: selectedIds.length })}
          variant="destructive"
          confirmLabel={tCommon("delete")}
          onConfirm={async () => {
            await batchDelete.mutateAsync();
          }}
        />
        <Dialog
          open={dateDialogOpen}
          onOpenChange={(open) => !updateDates.isPending && setDateDialogOpen(open)}
        >
          <DialogContent variant="modal">
            <DialogHeader>
              <DialogTitle>{t("changeDateTitle")}</DialogTitle>
            </DialogHeader>
            {dateImpact != null && (
              <p className="text-sm text-muted-foreground">
                {t("changeDateImpact", {
                  selected: dateImpact.selectedEntryCount,
                  documents: dateImpact.sourceDocumentCount,
                  affected: dateImpact.affectedEntryCount,
                })}
              </p>
            )}
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="min-h-11 rounded-md border border-border bg-bg px-3"
            />
            <DialogFooter>
              <Button
                variant="outline"
                disabled={updateDates.isPending}
                onClick={() => setDateDialogOpen(false)}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                disabled={updateDates.isPending || selectedDate === ""}
                onClick={() => updateDates.mutate()}
              >
                {tCommon("confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
