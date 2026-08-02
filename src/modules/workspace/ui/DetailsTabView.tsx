"use client";

import type { RefCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, CheckSquare } from "lucide-react";
import type { EntryCategory, Ledger, LedgerEntry } from "@/modules/ledger/contracts";
import type { EntryFilters } from "@/modules/ledger/ui";
import { EntryFilterPanel, LedgerEntryDetailModal } from "@/modules/ledger/ui";
import { LedgerEntryGroupsView } from "@/modules/ledger/ui/LedgerEntryGroupsView";
import { LedgerEntriesBatchActionToolbar } from "@/modules/ledger/ui/batch-action-toolbar";
import type { GroupedEntry } from "@/modules/ledger/hooks/useDetailsTabGrouping";
import type { PeriodParams } from "@/lib/period-utils";
import { formatCurrencyAmount } from "@/lib/format/currency";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
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
import { EmptyState } from "./EmptyState";
import type { useDetailsBatchController } from "./useDetailsBatchController";

type BatchController = ReturnType<typeof useDetailsBatchController>;
type LedgerEntryUpdate = Partial<Omit<LedgerEntry, "amount">> & { amount?: number };

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
  hasNextPage: boolean;
  monthStats: { mainTotal: string; mainCurrency: string };
  sentinelRef: RefCallback<HTMLDivElement>;
  batch: BatchController;
  selectedLedgerEntry: LedgerEntry | null;
  isDetailModalOpen: boolean;
  onViewEntry: (entry: LedgerEntry) => void;
  onCloseDetail: () => void;
  onUpdateEntry: (data: LedgerEntryUpdate) => Promise<void>;
  onDeleteEntry: () => Promise<void>;
  onViewSourceDocument?: () => void;
  onRefresh: () => Promise<void>;
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
    hasNextPage,
    monthStats,
    sentinelRef,
    batch,
    selectedLedgerEntry,
    isDetailModalOpen,
    onViewEntry,
    onCloseDetail,
    onUpdateEntry,
    onDeleteEntry,
    onViewSourceDocument,
    onRefresh,
  } = props;
  const t = useTranslations("DetailsTab");
  const tCommon = useTranslations("Common");
  const tFilter = useTranslations("EntryFilterPanel");
  const locale = useLocale();

  return (
    <PullToRefresh
      onRefresh={onRefresh}
      header={
        <DetailsToolbar
          {...(!batch.isSelectionMode
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
                onSelectAll={batch.selectAll}
                onClearSelection={batch.clearSelection}
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
      }
    >
      <div className="space-y-4">
        <div className="space-y-6 pt-2">
          <LedgerEntryGroupsView
            groups={groupedItems}
            categories={categories}
            mainCurrency={ledger?.settings.mainCurrency ?? monthStats.mainCurrency}
            onView={onViewEntry}
            selectionMode={batch.isSelectionMode}
            selectedIds={batch.selectedIds}
            onToggleSelection={batch.toggleSelection}
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
          {!hasNextPage && entries.length > 0 ? (
            <div className="flex justify-center py-4">
              <span className="text-xs text-muted-foreground/50">— {t("noMore")} —</span>
            </div>
          ) : null}
        </div>

        {selectedLedgerEntry != null ? (
          <LedgerEntryDetailModal
            ledgerEntry={selectedLedgerEntry}
            categories={categories}
            open={isDetailModalOpen}
            onClose={onCloseDetail}
            onUpdate={onUpdateEntry}
            onDelete={onDeleteEntry}
            {...(onViewSourceDocument == null ? {} : { onViewSourceDocument })}
          />
        ) : null}

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
    </PullToRefresh>
  );
}
