"use client";

import type { RefCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, CheckSquare } from "lucide-react";
import type { EntryCategory, Ledger, LedgerEntry } from "@/modules/ledger/contracts";
import type { EntryFilters } from "@/modules/ledger/ui/EntryFilterPanel";
import { EntryFilterPanel } from "@/modules/ledger/ui/EntryFilterPanel";
import { LedgerEntryGroupsView } from "@/modules/ledger/ui/LedgerEntryGroupsView";
import { LedgerEntriesBatchActionToolbar } from "@/modules/ledger/ui/batch-action-toolbar";
import type { GroupedEntry } from "@/modules/ledger/hooks/useDetailsTabGrouping";
import type { PeriodParams } from "@/lib/period-utils";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DetailsToolbar } from "./DetailsToolbar";
import { EmptyState } from "@/components/EmptyState";
import type { useDetailsBatchController } from "./useDetailsBatchController";

type BatchController = ReturnType<typeof useDetailsBatchController>;
interface DetailsTabViewProps {
  categories: EntryCategory[];
  ledger?: Ledger;
  periodParams: PeriodParams;
  filters: EntryFilters;
  advancedFilters: {
    categoryId?: string | null;
    currency?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
    search?: string | null;
  };
  onFiltersChange: (filters: EntryFilters) => void;
  onResetFilters: () => void;
  entries: LedgerEntry[];
  groupedItems: GroupedEntry[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  onRetryNextPage: () => void;
  hasNextPage: boolean;
  monthStats: { mainTotal: string | null; mainCurrency: string; unconvertedCount: number };
  sentinelRef: RefCallback<HTMLDivElement>;
  batch: BatchController;
  onViewEntry: (entry: LedgerEntry) => void;
}

export function DetailsTabView(props: DetailsTabViewProps) {
  const {
    categories,
    ledger,
    periodParams,
    filters,
    advancedFilters,
    onFiltersChange,
    onResetFilters,
    entries,
    groupedItems,
    isLoading,
    isFetchingNextPage,
    isFetchNextPageError,
    onRetryNextPage,
    hasNextPage,
    monthStats,
    sentinelRef,
    batch,
    onViewEntry,
  } = props;
  const t = useTranslations("DetailsTab");
  const tCommon = useTranslations("Common");
  const tFilter = useTranslations("EntryFilterPanel");
  const locale = useLocale();

  return (
    <>
      <DetailsToolbar
        {...(!batch.isSelectionMode && monthStats.mainTotal != null
          ? {
              totalLabel: formatCurrencyAmount(
                Number(monthStats.mainTotal),
                monthStats.mainCurrency,
                locale
              ),
            }
          : {})}
        batchActions={
          batch.isSelectionMode ? (
            <LedgerEntriesBatchActionToolbar
              variant="inline"
              selectedCount={batch.selectedIds.length}
              totalCount={entries.length}
              isAllSelected={batch.isAllSelected}
              hasMoreData={hasNextPage}
              onSelectAll={() => !batch.isPending && batch.selectAll()}
              onClearSelection={() => !batch.isPending && batch.clearSelection()}
              categories={categories}
              preferredCurrencies={ledger?.settings.currencies ?? []}
              onChangeCategory={async (categoryId) => {
                await batch.update.mutateAsync({ categoryId });
              }}
              onChangeCurrency={async (currency) => {
                await batch.update.mutateAsync({ currency });
              }}
              onChangeDate={() => batch.previewDate.mutate()}
              onDelete={() => batch.setDeleteDialogOpen(true)}
              isProcessing={batch.isPending}
            />
          ) : undefined
        }
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={batch.toggleSelectionMode}
          disabled={batch.isPending}
          className="h-8 w-8"
          aria-label={batch.isSelectionMode ? t("cancelSelect") : t("select")}
        >
          {batch.isSelectionMode ? (
            <ArrowLeft className="h-4 w-4" />
          ) : (
            <CheckSquare className="h-4 w-4" />
          )}
        </Button>
        {!batch.isSelectionMode ? (
          <EntryFilterPanel
            filters={filters}
            onFiltersChange={onFiltersChange}
            periodParams={periodParams}
            categories={categories}
            preferredCurrencies={ledger?.settings.currencies ?? []}
            showStatus={false}
            className="flex-1 sm:flex-none"
            onResetFilters={onResetFilters}
          />
        ) : null}
      </DetailsToolbar>
      {monthStats.unconvertedCount > 0 ? (
        <div
          role="status"
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
        >
          {tCommon("incompleteAccountingProjection")}
        </div>
      ) : null}
      <div className="space-y-4">
        <div className="space-y-6 pt-2">
          <LedgerEntryGroupsView
            groups={groupedItems}
            categories={categories}
            mainCurrency={ledger?.settings.mainCurrency ?? monthStats.mainCurrency}
            onView={onViewEntry}
            selectionMode={batch.isSelectionMode}
            selectedIds={batch.selectedIds}
            onToggleSelection={(id) => {
              if (!batch.isPending) batch.toggleSelection(id);
            }}
          />
          {isLoading ? (
            <div className="space-y-4 px-2 animate-pulse">
              {[1, 2, 3].map((idx) => (
                <div key={idx} className="bg-surface rounded-xl border border-border p-4 h-20" />
              ))}
            </div>
          ) : null}
          {!isLoading && entries.length === 0 ? (
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
          ) : null}
          <div ref={sentinelRef} className="h-1" />
          {isFetchingNextPage ? (
            <div className="flex justify-center py-4">
              <span className="text-sm text-muted-foreground">{tCommon("loading")}</span>
            </div>
          ) : null}
          {isFetchNextPageError ? (
            <div className="flex justify-center py-4">
              <Button variant="outline" size="sm" onClick={onRetryNextPage}>
                {t("loadMoreFailed")}
              </Button>
            </div>
          ) : null}
          {!hasNextPage && entries.length > 0 ? (
            <div className="flex justify-center py-4">
              <span className="text-xs text-muted-foreground/50">— {t("noMore")} —</span>
            </div>
          ) : null}
        </div>

        <ConfirmDialog
          open={batch.deleteDialogOpen}
          onOpenChange={batch.setDeleteDialogOpen}
          title={t("deleteSelectedTitle")}
          description={t("deleteSelectedDescription", { count: batch.selectedIds.length })}
          variant="destructive"
          confirmLabel={tCommon("delete")}
          onConfirm={async () => {
            await batch.remove.mutateAsync();
          }}
        />
        <Dialog
          open={batch.dateDialogOpen}
          onOpenChange={(open) => !batch.updateDates.isPending && batch.setDateDialogOpen(open)}
        >
          <DialogContent variant="modal">
            <DialogHeader>
              <DialogTitle>{t("changeDateTitle")}</DialogTitle>
            </DialogHeader>
            {batch.dateImpact != null ? (
              <p className="text-sm text-muted-foreground">
                {t("changeDateImpact", {
                  selected: batch.dateImpact.selectedEntryCount,
                  documents: batch.dateImpact.sourceDocumentCount,
                  affected: batch.dateImpact.affectedEntryCount,
                })}
              </p>
            ) : null}
            <input
              type="date"
              value={batch.selectedDate}
              onChange={(event) => batch.setSelectedDate(event.target.value)}
              className="min-h-11 rounded-md border border-border bg-bg px-3"
            />
            <DialogFooter>
              <Button
                variant="outline"
                disabled={batch.updateDates.isPending}
                onClick={() => batch.setDateDialogOpen(false)}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                disabled={batch.updateDates.isPending || batch.selectedDate === ""}
                onClick={() => batch.updateDates.mutate()}
              >
                {tCommon("confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
