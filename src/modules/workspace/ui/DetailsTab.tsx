"use client";
import { useCallback } from "react";
import type { Ledger } from "@/modules/ledger/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CheckSquare, Loader2, Tags, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Checkbox } from "@/components/ui/checkbox";
import { useModalStackStore } from "@/lib/store/modal-stack";
import {
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateTaskQueue,
} from "@/lib/query-keys";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useSelection } from "@/hooks/use-selection";
import {
  useBatchEntryActions,
  useDetailsTabData,
  useDetailsTabGrouping,
  useEntryMutations,
} from "@/modules/ledger/hooks";
import { EntryFilterPanel, LedgerEntryCard, LedgerEntryDetailModal } from "@/modules/ledger/ui";
import type { EntryFilters } from "@/modules/ledger/ui";
import { useDetailsTabState } from "./useDetailsTabState";
import { useDetailsTabFilters } from "./useDetailsTabFilters";
import type { EntryCategory } from "@/modules/ledger/contracts";
import type { PeriodParams } from "@/lib/period-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryIcon } from "@/components/CategoryIcon";
import { SUPPORTED_CURRENCIES } from "@/config/currencies";
import { cn } from "@/lib/utils";

interface DetailsTabProps {
  ledgerId: string;
  categories: EntryCategory[];
  ledger?: Ledger;
  periodParams: PeriodParams;
  onPeriodChange: (params: PeriodParams) => void;
  onFiltersChange: (filters: EntryFilters) => void;
  advancedFilters: {
    categoryId?: string | null;
    currency?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
  };
}

export function DetailsTab({
  ledgerId,
  categories,
  ledger,
  periodParams,
  onPeriodChange,
  onFiltersChange,
  advancedFilters,
}: DetailsTabProps) {
  const t = useTranslations("DetailsTab");
  const tBatch = useTranslations("BatchActions");
  const tCommon = useTranslations("Common");
  const tFilter = useTranslations("EntryFilterPanel");
  const _locale = useLocale();
  const queryClient = useQueryClient();
  const push = useModalStackStore((state) => state.push);

  // State management
  const {
    deleteConfirm,
    setDeleteConfirm,
    selectedLedgerEntry,
    setSelectedLedgerEntry,
    isDetailModalOpen,
    setIsDetailModalOpen,
    handleDeleteConfirm,
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
      ...(ledger !== undefined ? { ledger } : {}),
    });

  // Grouping
  const { groupedItems } = useDetailsTabGrouping(entries);

  // Filters
  const { filters } = useDetailsTabFilters({
    periodParams,
    advancedFilters,
  });

  // Selection mode
  const {
    isSelectionMode,
    toggleSelectionMode,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isAllSelected,
  } = useSelection({ allIds: entries.map((e) => e.id) });

  // Mutations
  const { updateEntry, deleteEntry } = useEntryMutations({
    ledgerId,
    categories,
    selectedLedgerEntry,
    setSelectedLedgerEntry,
    setIsDetailModalOpen,
  });

  const { batchCategorize, batchChangeCategory, batchChangeCurrency, batchDelete } =
    useBatchEntryActions(ledgerId, clearSelection);
  const currencyList = [
    ...(ledger?.metadata?.settings?.currencies ?? []).filter((currency) =>
      SUPPORTED_CURRENCIES.includes(currency as (typeof SUPPORTED_CURRENCIES)[number])
    ),
    ...SUPPORTED_CURRENCIES.filter(
      (currency) => !(ledger?.metadata?.settings?.currencies ?? []).includes(currency)
    ),
  ];
  const isBatchProcessing =
    batchCategorize.isPending ||
    batchChangeCategory.isPending ||
    batchChangeCurrency.isPending ||
    batchDelete.isPending;
  const masterChecked: boolean | "indeterminate" =
    isAllSelected ? true : selectedIds.length > 0 ? "indeterminate" : false;

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
      queryClient.invalidateQueries({ predicate: invalidateTaskQueue(ledgerId) }),
    ]);
  }, [queryClient, ledgerId]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-4">
        {/* Filter Section */}
        <div className="px-2 mb-2 sm:mb-4">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {entries.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSelectionMode}
                  className="shrink-0 h-8 w-8"
                  title={isSelectionMode ? t("cancelSelect") : t("select")}
                >
                  {isSelectionMode ? (
                    <ArrowLeft className="w-4 h-4" />
                  ) : (
                    <CheckSquare className="w-4 h-4" />
                  )}
                </Button>
                {isSelectionMode && (
                  <>
                    <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5">
                        <Checkbox
                          checked={masterChecked}
                          onCheckedChange={(checked) => {
                            if (checked === true) selectAll();
                            else clearSelection();
                          }}
                          aria-label={isAllSelected ? t("deselectAll") : t("selectAll")}
                          className="h-4 w-4"
                      />
                      <span className="text-xs font-medium text-text">
                        {tBatch("selected", { count: selectedIds.length })}
                      </span>
                    </div>
                    {selectedIds.length > 0 && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => batchCategorize.mutate(selectedIds)}
                          disabled={isBatchProcessing}
                          className="shrink-0 h-8 px-3 text-xs"
                        >
                          {batchCategorize.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                          ) : (
                            <Tags className="w-3.5 h-3.5 mr-1" />
                          )}
                          {tBatch("aiCategorize")}
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isBatchProcessing}
                              className="shrink-0 h-8 px-3 text-xs"
                            >
                              {batchChangeCategory.isPending ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                              ) : (
                                <CategoryIcon iconName="Tag" className="w-3.5 h-3.5 mr-1" />
                              )}
                              {tBatch("manualCategory")}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-48 max-h-64 overflow-y-auto">
                            <DropdownMenuItem
                              onClick={() => batchChangeCategory.mutate({ ids: selectedIds, categoryId: null })}
                              className="text-muted-foreground"
                            >
                              <CategoryIcon iconName="CircleSlash" className="w-4 h-4 mr-2 opacity-50" />
                              {tBatch("uncategorized")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {categories.map((category) => (
                              <DropdownMenuItem
                                key={category.id}
                                onClick={() =>
                                  batchChangeCategory.mutate({
                                    ids: selectedIds,
                                    categoryId: category.id,
                                  })
                                }
                              >
                                <CategoryIcon iconName={category.icon} className="w-4 h-4 mr-2" />
                                {category.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isBatchProcessing}
                              className="shrink-0 h-8 px-3 text-xs"
                            >
                              {batchChangeCurrency.isPending ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                              ) : (
                                <span className="mr-1 text-xs font-semibold">$</span>
                              )}
                              {tBatch("setCurrency")}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-32 max-h-64 overflow-y-auto">
                            {currencyList.map((currency) => (
                              <DropdownMenuItem
                                key={currency}
                                onClick={() =>
                                  batchChangeCurrency.mutate({
                                    ids: selectedIds,
                                    currency,
                                  })
                                }
                                className={cn(
                                  (ledger?.metadata?.settings?.currencies ?? []).includes(currency) &&
                                    "font-medium"
                                )}
                              >
                                {currency}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => batchDelete.mutate(selectedIds)}
                          disabled={isBatchProcessing}
                          className={cn(
                            "shrink-0 h-8 px-3 text-xs",
                            "text-destructive hover:text-destructive hover:bg-destructive/10",
                            "border-destructive/30"
                          )}
                        >
                          {batchDelete.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {!isSelectionMode && (
              <EntryFilterPanel
                filters={filters}
                onFiltersChange={onFiltersChange}
                periodParams={periodParams}
                onPeriodChange={onPeriodChange}
                categories={categories}
                preferredCurrencies={ledger?.metadata?.settings?.currencies ?? []}
                className="flex-1 sm:flex-none"
              />
            )}
            <span className="text-xs text-muted-foreground font-mono ml-auto">
              {tFilter("filteredTotal")} {monthStats.mainCurrency} {monthStats.mainTotal.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Entry Groups */}
        <div className="space-y-6 pt-2">
          <AnimatePresence mode="popLayout">
            {groupedItems.map((group) => (
              <motion.div
                key={group.title}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                <div className="py-2 px-2 flex items-center justify-between">
                  <h3 className="text-[10px] sm:text-xs font-medium text-muted-foreground flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50"></span>
                    {group.title}
                  </h3>
                  <span className="text-[10px] sm:text-xs font-mono font-medium text-muted-foreground">
                    {monthStats.mainCurrency} {group.total.toFixed(2)}
                  </span>
                </div>
                <div className="space-y-4 px-2">
                  {group.items.map((entry) => (
                    <motion.div
                      key={entry.id}
                      layout
                      layoutId={entry.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                    >
                      <LedgerEntryCard
                        ledgerEntry={entry}
                        categories={categories}
                        {...(ledger?.metadata?.settings?.mainCurrency !== undefined
                          ? { mainCurrency: ledger.metadata.settings.mainCurrency }
                          : {})}
                        onView={() => {
                          if (!isSelectionMode) {
                            handleViewEntry(entry);
                          }
                        }}
                        selectionMode={isSelectionMode}
                        isSelected={selectedIds.includes(entry.id)}
                        onToggleSelect={() => toggleSelection(entry.id)}
                      />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

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
            <div className="text-center py-20 text-muted-foreground">
              <p>{tCommon("noRecords")}</p>
            </div>
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
            onUpdate={(data) =>
              updateEntry.mutate({
                ledgerEntryId: selectedLedgerEntry.id,
                data,
              })
            }
            onDelete={() => setDeleteConfirm({ open: true, id: selectedLedgerEntry.id })}
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

        {/* Delete Confirmation */}
        <ConfirmDialog
          open={deleteConfirm.open}
          onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
          title={t("deleteConfirmTitle")}
          description={t("deleteConfirmDesc")}
          onConfirm={() => handleDeleteConfirm((id) => deleteEntry.mutate(id))}
          confirmLabel={tCommon("delete")}
          variant="destructive"
        />
      </div>
    </PullToRefresh>
  );
}
