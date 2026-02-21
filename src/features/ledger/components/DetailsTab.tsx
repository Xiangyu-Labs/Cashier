"use client";

import { BackgroundRefreshIndicator } from "@/components/ui/background-refresh-indicator";
import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { getLedgerEntriesAction } from "@/features/ledger/server/actions/entries";
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats";
import { queryKeys, invalidateLedgerCache } from "@/lib/query-keys";
import { LedgerEntry, EntryCategory, Ledger } from "@/types/api";
import { LedgerEntryCard } from "./LedgerEntryCard";
import { LedgerEntryDetailModal } from "./LedgerEntryDetailModal";
import { EntryFilterPanel, EntryFilters } from "./EntryFilterPanel";
import { BatchActionToolbar } from "./BatchActionToolbar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { CheckSquare, X } from "lucide-react";
import { useSelectionMode } from "@/features/ledger/client/hooks/useSelectionMode";
import { useEntryMutations } from "@/features/ledger/client/hooks/useEntryMutations";
import { useBatchEntryActions } from "@/features/ledger/client/hooks/useBatchEntryActions";
import { PeriodParams, periodToDateRange } from "@/lib/period-utils";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";

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
    onAdvancedFiltersChange: (filters: {
        categoryId?: string | null;
        currency?: string | null;
        minAmount?: number | null;
        maxAmount?: number | null;
    }) => void;
}

export function DetailsTab({
    ledgerId,
    categories,
    ledger,
    periodParams,
    onPeriodChange,
    onFiltersChange,
    advancedFilters,
    onAdvancedFiltersChange,
}: DetailsTabProps) {
    const t = useTranslations("DetailsTab");
    const tCommon = useTranslations("Common");
    const locale = useLocale();
    const queryClient = useQueryClient();
    const push = useModalStackStore(state => state.push);

    // Convert periodParams to date range
    const dateRange = useMemo(() => periodToDateRange(periodParams), [periodParams]);

    // Combine period-based dates with advanced filters from parent
    const filters: EntryFilters = useMemo(() => ({
        startDate: dateRange.startDate ? new Date(dateRange.startDate) : undefined,
        endDate: dateRange.endDate ? new Date(dateRange.endDate) : undefined,
        ...advancedFilters,
    }), [dateRange, advancedFilters]);

    const startDateStr = formatDateTimeForApi(filters.startDate) ?? null;
    const endDateStr = formatDateTimeForApi(filters.endDate) ?? null;
    const mainCurrency = ledger?.metadata?.settings?.mainCurrency || 'CNY';

    // Build filter key for queryKey (serialized to string for type compatibility)
    const filterKey = useMemo(() => {
        const parts: string[] = [];
        if (filters.categoryId) parts.push(`cat:${filters.categoryId}`);
        if (filters.currency) parts.push(`cur:${filters.currency}`);
        if (filters.minAmount !== undefined && filters.minAmount !== null) parts.push(`min:${filters.minAmount}`);
        if (filters.maxAmount !== undefined && filters.maxAmount !== null) parts.push(`max:${filters.maxAmount}`);
        return parts.length > 0 ? parts.join('|') : null;
    }, [filters.categoryId, filters.currency, filters.minAmount, filters.maxAmount]);

    const { data: summaryData } = useQuery({
        queryKey: queryKeys.ledgerEntries(ledgerId, 'summary', startDateStr, endDateStr, mainCurrency, filterKey),
        queryFn: () => getLedgerStatsAction(ledgerId, startDateStr || undefined, endDateStr || undefined, mainCurrency, {
            categoryId: filters.categoryId,
            currency: filters.currency,
            minAmount: filters.minAmount,
            maxAmount: filters.maxAmount,
        }),
        enabled: true
    });

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading
    } = useInfiniteQuery({
        queryKey: queryKeys.ledgerEntries(ledgerId, 'infinite', startDateStr, endDateStr, filterKey),
        queryFn: ({ pageParam }) => getLedgerEntriesAction(ledgerId, {
            startDate: startDateStr || undefined,
            endDate: endDateStr || undefined,
            categoryId: filters.categoryId,
            currency: filters.currency,
            minAmount: filters.minAmount,
            maxAmount: filters.maxAmount,
            cursor: pageParam,
            limit: 50
        }),
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        initialPageParam: undefined as string | undefined,
        placeholderData: (previousData) => previousData,
    });

    const monthEntries = useMemo(() => {
        if (!data?.pages) return [];
        const allItems = data.pages.flatMap(page => page.items);
        const uniqueMap = new Map<string, LedgerEntry>();
        allItems.forEach(item => uniqueMap.set(item.id, item));
        return Array.from(uniqueMap.values());
    }, [data]);

    const monthStats = useMemo(() => {
        const mainCurrency = ledger?.metadata?.settings?.mainCurrency || 'CNY';
        const totals = summaryData?.totals || [];
        const convertedTotal = summaryData?.convertedTotal;
        const mainTotal = convertedTotal?.total || 0;
        const hasMultipleCurrencies = totals.length > 1;

        return {
            mainTotal,
            mainCurrency: convertedTotal?.currency || mainCurrency,
            hasMultipleCurrencies,
            breakdown: totals
        };
    }, [summaryData, ledger]);

    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
    const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<LedgerEntry | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    // Use extracted hooks
    const {
        selectionMode,
        setSelectionMode,
        selectedIds,
        toggleSelection,
        selectAll,
        clearSelection,
        isAllSelected,
    } = useSelectionMode(monthEntries.map(e => e.id));

    const {
        updateEntry,
        deleteEntry,
    } = useEntryMutations({
        ledgerId,
        categories,
        selectedLedgerEntry,
        setSelectedLedgerEntry,
        setIsDetailModalOpen,
    });

    const {
        batchCategorize,
        batchChangeCategory,
        batchDelete,
    } = useBatchEntryActions(ledgerId, clearSelection);

    // Infinite scroll
    const sentinelRef = useInfiniteScroll({
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
    });

    // Helper to get date string (yyyy-MM-dd) from entry's source document
    const getDateStr = (entry: LedgerEntry) => {
        if (entry.sourceDocument?.entryDate) return entry.sourceDocument.entryDate;
        return new Date(entry.createdAt).toLocaleDateString('sv');
    };

    const groupedItems = useMemo(() => {
        const sortedEntries = [...monthEntries].sort((a, b) => {
            const dateA = getDateStr(a);
            const dateB = getDateStr(b);
            return dateB.localeCompare(dateA);
        });

        const groups: Record<string, { timestamp: number; title: string; items: LedgerEntry[]; total: number }> = {};

        const todayStr = new Date().toLocaleDateString('sv');
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toLocaleDateString('sv');

        sortedEntries.forEach(entry => {
            const dateStr = getDateStr(entry);
            const [year, month, day] = dateStr.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            const sortTimestamp = date.getTime();

            let dateKey = "";
            if (dateStr === todayStr) {
                dateKey = t("today");
            } else if (dateStr === yesterdayStr) {
                dateKey = t("yesterday");
            } else {
                dateKey = date.toLocaleDateString(locale, { month: "long", day: "numeric", weekday: "long" });
            }

            if (!groups[dateKey]) {
                groups[dateKey] = {
                    title: dateKey,
                    timestamp: sortTimestamp,
                    items: [],
                    total: 0
                };
            }

            groups[dateKey].items.push(entry);
            groups[dateKey].total += entry.convertedAmount
                ? parseFloat(entry.convertedAmount)
                : parseFloat(entry.amount);
        });

        return Object.values(groups).sort((a, b) => b.timestamp - a.timestamp);
    }, [monthEntries, locale, t]);

    const handleRefresh = useCallback(async () => {
        await queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
    }, [queryClient, ledgerId]);

    // Handle filter changes - distinguish between period changes and additional filter changes
    const handleLocalFiltersChange = useCallback((newFilters: EntryFilters) => {
        // If dates changed, propagate to parent (period change)
        if (newFilters.startDate !== filters.startDate || newFilters.endDate !== filters.endDate) {
            onFiltersChange(newFilters);
        }

        // Update advanced filters (category, currency, amount)
        onAdvancedFiltersChange({
            categoryId: newFilters.categoryId,
            currency: newFilters.currency,
            minAmount: newFilters.minAmount,
            maxAmount: newFilters.maxAmount,
        });
    }, [filters.startDate, filters.endDate, onFiltersChange, onAdvancedFiltersChange]);

    // Batch action handlers
    const handleBatchAiCategorize = () => {
        const ids = Array.from(selectedIds);
        batchCategorize.mutate(ids);
    };

    const handleBatchChangeCategory = (categoryId: string | null) => {
        const ids = Array.from(selectedIds);
        batchChangeCategory.mutate({ ids, categoryId });
    };

    const handleBatchDelete = () => {
        const ids = Array.from(selectedIds);
        batchDelete.mutate(ids);
    };

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <BackgroundRefreshIndicator
                queryKey={['ledgerEntries', ledgerId]}
                delay={500}
            />

            <div className="space-y-4">
                {/* Header Section - Responsive layout */}
                <div className="px-2 mb-2 sm:mb-4 pt-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                        {/* Filter Panel and Select Button */}
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            {/* Select/Cancel button - leftmost position */}
                            {monthEntries.length > 0 && (
                                <Button
                                    variant={selectionMode ? "secondary" : "ghost"}
                                    size="icon"
                                    onClick={() => {
                                        if (selectionMode) {
                                            clearSelection();
                                        } else {
                                            setSelectionMode(true);
                                        }
                                    }}
                                    className="shrink-0 h-8 w-8"
                                    title={selectionMode ? t("cancelSelect") : t("select")}
                                >
                                    {selectionMode ? (
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
                                className="flex-1 sm:flex-none"
                            />
                        </div>

                        {/* Expense Summary - Right aligned on desktop, full width on mobile */}
                        <div className="flex items-center justify-between sm:flex-col sm:items-end gap-1 py-1 sm:py-0">
                            <div className="text-muted-foreground text-xs sm:text-[10px]">{t("expenseSummary")}</div>
                            <div className="flex items-baseline gap-1.5 flex-wrap justify-end">
                                {monthStats.hasMultipleCurrencies ? (
                                    <>
                                        {/* Original currencies breakdown - small text */}
                                        <span className="text-[10px] font-mono text-muted-foreground opacity-80">
                                            {monthStats.breakdown.map((b, idx) => (
                                                <span key={b.currency}>
                                                    {idx > 0 && <span className="mx-0.5 opacity-50">·</span>}
                                                    {b.currency || "?"} {b.total.toFixed(0)}
                                                </span>
                                            ))}
                                        </span>
                                        {/* Approximately equals */}
                                        <span className="text-sm text-muted-foreground">≈</span>
                                        {/* Main currency total */}
                                        <span className="text-lg sm:text-xl font-bold font-mono tracking-tight leading-none">
                                            <span className="text-xs text-muted-foreground font-normal mr-0.5">{monthStats.mainCurrency}</span>
                                            {monthStats.mainTotal.toFixed(2)}
                                        </span>
                                    </>
                                ) : (
                                    /* Single currency - just show total */
                                    <span className="text-lg sm:text-xl font-bold font-mono tracking-tight leading-none">
                                        <span className="text-xs text-muted-foreground font-normal mr-0.5">{monthStats.mainCurrency}</span>
                                        {monthStats.mainTotal.toFixed(2)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

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
                                <div className="py-2 px-2 flex items-center gap-3">
                                    <h3 className="text-[10px] sm:text-xs font-medium text-muted-foreground flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary/50"></span>
                                        {group.title}
                                    </h3>
                                    <span className="text-[10px] sm:text-xs text-muted-foreground/50">·</span>
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
                                                mainCurrency={ledger?.metadata?.settings?.mainCurrency}
                                                onView={() => {
                                                    if (!selectionMode) {
                                                        setSelectedLedgerEntry(entry);
                                                        setIsDetailModalOpen(true);
                                                    }
                                                }}
                                                selectionMode={selectionMode}
                                                isSelected={selectedIds.has(entry.id)}
                                                onToggleSelect={() => toggleSelection(entry.id)}
                                            />
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {isLoading && (
                        <div className="space-y-4 px-2 animate-pulse">
                            {[1, 2, 3].map((idx) => (
                                <div key={idx} className="bg-surface rounded-xl border border-border p-4 h-20" />
                            ))}
                        </div>
                    )}

                    {!isLoading && monthEntries.length === 0 && (
                        <div className="text-center py-20 text-muted-foreground">
                            <p>{tCommon("noRecords")}</p>
                        </div>
                    )}

                    {/* Infinite scroll sentinel & loading indicator */}
                    <div ref={sentinelRef} className="h-1" />
                    {isFetchingNextPage && (
                        <div className="flex justify-center py-4">
                            <span className="text-sm text-muted-foreground">{tCommon("loading")}</span>
                        </div>
                    )}
                </div>

                {/* Batch Action Toolbar */}
                {selectionMode && selectedIds.size > 0 && (
                    <BatchActionToolbar
                        selectedCount={selectedIds.size}
                        totalCount={monthEntries.length}
                        isAllSelected={isAllSelected}
                        onSelectAll={selectAll}
                        onClearSelection={clearSelection}
                        onAiCategorize={handleBatchAiCategorize}
                        onChangeCategory={handleBatchChangeCategory}
                        onDelete={handleBatchDelete}
                        categories={categories}
                        isAiCategorizing={batchCategorize.isPending}
                        isChangingCategory={batchChangeCategory.isPending}
                        isDeleting={batchDelete.isPending}
                    />
                )}

                {/* Detail Modal */}
                {selectedLedgerEntry && (
                    <LedgerEntryDetailModal
                        ledgerEntry={selectedLedgerEntry}
                        categories={categories}
                        open={isDetailModalOpen}
                        onClose={() => {
                            setIsDetailModalOpen(false);
                            setSelectedLedgerEntry(null);
                        }}
                        onUpdate={(data) => updateEntry.mutate({ ledgerEntryId: selectedLedgerEntry.id, data })}
                        onDelete={() => setDeleteConfirm({ open: true, id: selectedLedgerEntry.id })}
                        onViewSourceDocument={selectedLedgerEntry.sourceDocumentId ? () => push({ type: 'source-document', id: selectedLedgerEntry.sourceDocumentId! }) : undefined}
                    />
                )}

                {/* Delete Confirmation */}
                <ConfirmDialog
                    open={deleteConfirm.open}
                    onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
                    title={t("deleteConfirmTitle")}
                    description={t("deleteConfirmDesc")}
                    onConfirm={() => {
                        if (deleteConfirm.id) {
                            deleteEntry.mutate(deleteConfirm.id);
                            setDeleteConfirm({ open: false, id: null });
                        }
                    }}
                    confirmLabel={tCommon("delete")}
                    variant="destructive"
                />
            </div>
        </PullToRefresh>
    );
}
