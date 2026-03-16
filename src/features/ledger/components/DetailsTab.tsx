"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { CheckSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { invalidateLedgerCache } from "@/lib/query-keys";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { LedgerEntryCard } from "./LedgerEntryCard";
import { LedgerEntryDetailModal } from "./LedgerEntryDetailModal";
import { EntryFilterPanel, EntryFilters } from "./EntryFilterPanel";
import { BatchActionToolbar } from "@/components/batch-action-toolbar";
import { useSelection } from "@/hooks/use-selection";
import { useEntryMutations } from "../client/hooks/use-entry-mutations";
import { useBatchEntryActions } from "../client/hooks/use-batch-entry-actions";
import { useDetailsTabState } from "../client/hooks/use-details-tab-state";
import { useDetailsTabData } from "../client/hooks/use-details-tab-data";
import { useDetailsTabGrouping } from "../client/hooks/use-details-tab-grouping";
import { useDetailsTabFilters } from "../client/hooks/use-details-tab-filters";
import type { EntryCategory, Ledger } from "@/types/api";
import type { PeriodParams } from "@/lib/period-utils";

interface DetailsTabProps {
    ledgerId: string;
    categories: EntryCategory[];
    ledger?: Ledger;
    periodParams: PeriodParams;
    onPeriodChange: (params: PeriodParams) => void;
    _onFiltersChange: (filters: EntryFilters) => void;
    advancedFilters: {
        categoryId?: string | null;
        currency?: string | null;
        minAmount?: number | null;
        maxAmount?: number | null;
    };
    onAdvancedFiltersChange: (filters: {
        categoryId?: string | null;
        currency?: string | null;
        minAmount?: number | null;
        maxAmount?: number | null;
    }) => void;
    monthStartDay?: number;
}

export function DetailsTab({
    ledgerId,
    categories,
    ledger,
    periodParams,
    onPeriodChange,
    _onFiltersChange,
    advancedFilters,
    onAdvancedFiltersChange,
    monthStartDay = 1,
}: DetailsTabProps) {
    const t = useTranslations("DetailsTab");
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

    // Data fetching
    const {
        entries,
        isLoading,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
        monthStats,
    } = useDetailsTabData({
        ledgerId,
        ledger,
        periodParams,
        advancedFilters,
    });

    // Grouping
    const { groupedItems } = useDetailsTabGrouping(entries);

    // Filters
    const { filters, handleFiltersChange } = useDetailsTabFilters({
        periodParams,
        advancedFilters,
    });

    // Selection mode
    const {
        isSelectionMode,
        setSelectionMode,
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

    const {
        batchCategorize,
        batchChangeCategory,
        batchChangeCurrency,
        batchDelete,
    } = useBatchEntryActions(ledgerId, clearSelection);

    // Infinite scroll
    const sentinelRef = useInfiniteScroll({
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
    });

    // Handlers
    const handleRefresh = async () => {
        await queryClient.invalidateQueries({
            predicate: invalidateLedgerCache(ledgerId),
        });
    };

    const handleLocalFiltersChange = handleFiltersChange(
        onPeriodChange,
        onAdvancedFiltersChange
    );

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="space-y-4">
                {/* Filter Section */}
                <div className="px-2 mb-2 sm:mb-4">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        {entries.length > 0 && (
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
                                title={isSelectionMode ? t("cancelSelect") : t("select")}
                            >
                                {isSelectionMode ? (
                                    <X className="w-4 h-4" />
                                ) : (
                                    <CheckSquare className="w-4 h-4" />
                                )}
                            </Button>
                        )}
                        <EntryFilterPanel
                            filters={filters}
                            onFiltersChange={handleLocalFiltersChange}
                            periodParams={periodParams}
                            onPeriodChange={onPeriodChange}
                            categories={categories}
                            preferredCurrencies={ledger?.metadata?.settings?.currencies || []}
                            monthStartDay={monthStartDay}
                            className="flex-1 sm:flex-none"
                        />
                        <span className="text-xs text-muted-foreground font-mono ml-auto">
                            {tFilter("filteredTotal")} {monthStats.mainCurrency}{" "}
                            {monthStats.mainTotal.toFixed(2)}
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
                                                mainCurrency={
                                                    ledger?.metadata?.settings?.mainCurrency
                                                }
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
                                <div
                                    key={idx}
                                    className="bg-surface rounded-xl border border-border p-4 h-20"
                                />
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
                            <span className="text-sm text-muted-foreground">
                                {tCommon("loading")}
                            </span>
                        </div>
                    )}
                    {!hasNextPage && entries.length > 0 && (
                        <div className="flex justify-center py-4">
                            <span className="text-xs text-muted-foreground/50">
                                — {t("noMore")} —
                            </span>
                        </div>
                    )}
                </div>

                {/* Batch Action Toolbar */}
                {isSelectionMode && selectedIds.length > 0 && (
                    <BatchActionToolbar
                        selectedCount={selectedIds.length}
                        totalCount={entries.length}
                        isAllSelected={isAllSelected}
                        onSelectAll={selectAll}
                        onClearSelection={clearSelection}
                        onAiCategorize={() => batchCategorize.mutate(selectedIds)}
                        onChangeCategory={(categoryId) =>
                            batchChangeCategory.mutate({
                                ids: selectedIds,
                                categoryId,
                            })
                        }
                        onChangeCurrency={(currency) =>
                            batchChangeCurrency.mutate({
                                ids: selectedIds,
                                currency,
                            })
                        }
                        onDelete={() => batchDelete.mutate(selectedIds)}
                        categories={categories}
                        preferredCurrencies={ledger?.metadata?.settings?.currencies || []}
                        isAiCategorizing={batchCategorize.isPending}
                        isChangingCategory={batchChangeCategory.isPending}
                        isChangingCurrency={batchChangeCurrency.isPending}
                        isDeleting={batchDelete.isPending}
                    />
                )}

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
                        onDelete={() =>
                            setDeleteConfirm({ open: true, id: selectedLedgerEntry.id })
                        }
                        onViewSourceDocument={
                            selectedLedgerEntry.sourceDocumentId
                                ? () =>
                                      push({
                                          type: "source-document",
                                          id: selectedLedgerEntry.sourceDocumentId!,
                                      })
                                : undefined
                        }
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
