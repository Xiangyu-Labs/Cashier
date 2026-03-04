import { useState, useCallback, useMemo } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { LedgerEntry, EntryCategory, SourceDocument, Ledger } from "@/types/api";
import { SourceDocumentCard } from "@/features/source-document/components/SourceDocumentCard";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { SourceDocumentEditRetryDialog } from "./SourceDocumentEditRetryDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { EntryFilterPanel, type EntryFilters } from "./EntryFilterPanel";
import { useTranslations, useLocale } from "next-intl";
import { useUnifiedSourceDocuments, SourceDocumentGroup } from "@/features/source-document/client/hooks/useUnifiedSourceDocuments";
import { type SourceDocumentStatusType } from "@/features/source-document/server/schema";
import { useLayoutTransition } from "@/hooks/useLayoutTransition";
import { invalidateLedgerCache, queryKeys } from "@/lib/query-keys";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { PeriodParams, periodToDateRange } from "@/lib/period-utils";
import { useLedgerEntriesMutations } from "@/features/ledger/client/hooks/useLedgerEntriesMutations";
import { usePrefetchAdjacentPeriods } from "@/features/ledger/client/hooks/usePrefetchAdjacentPeriods";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { useSelectionMode } from "@/features/ledger/client/hooks/useSelectionMode";
import { useBatchSourceDocumentActions } from "@/features/source-document/client/hooks/useBatchSourceDocumentActions";
import { BatchActionToolbar } from "./BatchActionToolbar";
import { Button } from "@/components/ui/button";
import { CheckSquare, X } from "lucide-react";

interface LedgerEntriesTabProps {
    ledgerId: string;
    categories: EntryCategory[];
    ledger?: Ledger;
    periodParams: PeriodParams;
    onPeriodChange: (params: PeriodParams) => void;
    onFiltersChange: (filters: EntryFilters) => void;
    monthStartDay?: number;
}

export function LedgerEntriesTab({
    ledgerId,
    categories,
    ledger,
    periodParams,
    onPeriodChange,
    onFiltersChange,
    monthStartDay = 1,
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
    const filters: EntryFilters = useMemo(() => ({
        startDate: dateRange.startDate ? new Date(dateRange.startDate) : undefined,
        endDate: dateRange.endDate ? new Date(dateRange.endDate) : undefined,
    }), [dateRange]);

    const mainCurrency = ledger?.metadata?.settings?.mainCurrency || 'CNY';
    const startDateStr = formatDateTimeForApi(filters.startDate) ?? null;
    const endDateStr = formatDateTimeForApi(filters.endDate) ?? null;

    const { data: summaryData } = useQuery({
        queryKey: queryKeys.ledgerEntries(ledgerId, 'summary', startDateStr, endDateStr, mainCurrency, null),
        queryFn: () => getLedgerStatsAction(ledgerId, startDateStr || undefined, endDateStr || undefined, mainCurrency, {
            minAmount: filters.minAmount,
            maxAmount: filters.maxAmount,
        }),
    });

    const filteredTotal = summaryData?.convertedTotal?.total ?? 0;

    const {
        updateEntry,
        deleteEntry,
        deleteSourceDocument,
        batchDeleteSourceDocuments,
    } = useLedgerEntriesMutations(ledgerId, categories);

    // Prefetch adjacent periods in background for faster switching
    usePrefetchAdjacentPeriods(ledgerId, periodParams);

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

    const pushModal = useModalStackStore(state => state.push);
    // Unified Data Hook
    const {
        groups,
        isLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useUnifiedSourceDocuments(ledgerId, {
        dateRange: { start: filters.startDate, end: filters.endDate },
        minAmount: filters.minAmount ?? undefined,
        maxAmount: filters.maxAmount ?? undefined,
    });

    // Infinite scroll
    const sentinelRef = useInfiniteScroll({
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
    });

    // Handlers
    const handleViewSourceDetail = useCallback((group: { sourceDocument: SourceDocument; ledgerEntries: LedgerEntry[] }) => {
        pushModal({ type: 'source-document', id: group.sourceDocument.id });
    }, [pushModal]);

    const handleRetry = useCallback((doc: SourceDocument) => {
        setRetrySourceDocument(doc);
    }, []);

    const handleDeleteSourceConfirm = useCallback((doc: SourceDocument) => {
        setDeleteConfirm({
            open: true,
            type: "sourceDocument",
            id: doc.id,
            title: t("deleteConfirmTitle"),
            description: t("deleteConfirmDesc")
        });
    }, [t]);

    const handleUpdateLedgerEntry = useCallback((id: string, data: Partial<Omit<LedgerEntry, 'amount'>> & { amount?: number }) => {
        updateEntry.mutate({ ledgerEntryId: id, data });
    }, [updateEntry]);

    const handleViewLedgerEntry = useCallback((entry: LedgerEntry) => {
        pushModal({ type: 'ledger-entry', id: entry.id });
    }, [pushModal]);

    // Helper Action Handlers
    function handleDeleteConfirmAction() {
        if (!deleteConfirm.id || !deleteConfirm.type) return;

        if (deleteConfirm.type === "sourceDocument") {
            deleteSourceDocument.mutate(deleteConfirm.id);
            setDeleteConfirm({ ...deleteConfirm, open: false });
        } else if (deleteConfirm.id === "ALL_ERRORS") {
            const ids = groups.anomaly.map((g: SourceDocumentGroup) => g.sourceDocument.id);
            batchDeleteSourceDocuments.mutate(ids);
            setDeleteConfirm({ ...deleteConfirm, open: false });
        } else if (deleteConfirm.type === "ledgerEntry") {
            deleteEntry.mutate(deleteConfirm.id);
            setDeleteConfirm({ ...deleteConfirm, open: false });
        }
    }

    // --- Date Grouping for Completed Documents ---

    // Helper to get date string from source document
    const getSourceDocDateStr = useCallback((group: SourceDocumentGroup): string => {
        // Use sourceDocument's entryDate (authoritative source for the document's date)
        if (group.sourceDocument.entryDate) {
            return group.sourceDocument.entryDate;
        }
        // Fallback to sourceDocument createdAt
        const createdAt = group.sourceDocument.createdAt;
        if (createdAt) {
            const date = new Date(createdAt);
            return date.toLocaleDateString('sv'); // Returns YYYY-MM-DD
        }
        return new Date().toLocaleDateString('sv');
    }, []);

    // Group completed documents by date
    const groupedCompletedByDate = useMemo(() => {
        const todayStr = new Date().toLocaleDateString('sv');
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toLocaleDateString('sv');

        const dateGroups: Record<string, {
            title: string;
            timestamp: number;
            items: SourceDocumentGroup[];
            total: number;
        }> = {};

        const _mainCurrency = ledger?.metadata?.settings?.mainCurrency || 'CNY';

        groups.completed.forEach(group => {
            const dateStr = getSourceDocDateStr(group);
            const [year, month, day] = dateStr.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            const sortTimestamp = date.getTime();

            let dateKey = "";
            if (dateStr === todayStr) {
                dateKey = tDetails("today");
            } else if (dateStr === yesterdayStr) {
                dateKey = tDetails("yesterday");
            } else {
                dateKey = date.toLocaleDateString(locale, { month: "long", day: "numeric", weekday: "long" });
            }

            if (!dateGroups[dateKey]) {
                dateGroups[dateKey] = {
                    title: dateKey,
                    timestamp: sortTimestamp,
                    items: [],
                    total: 0
                };
            }

            dateGroups[dateKey].items.push(group);

            // Calculate total for this date using converted amount for foreign currency
            group.ledgerEntries.forEach(entry => {
                const amount = entry.convertedAmount
                    ? parseFloat(entry.convertedAmount)
                    : parseFloat(entry.amount);
                dateGroups[dateKey].total += amount;
            });
        });

        return Object.values(dateGroups).sort((a, b) => b.timestamp - a.timestamp);
    }, [groups.completed, getSourceDocDateStr, locale, ledger?.metadata?.settings?.mainCurrency, tDetails]);



    const handleRefresh = useCallback(async () => {
        await queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
    }, [queryClient, ledgerId]);

    // --- Batch Operations ---

    // Collect all visible source document IDs
    const allSourceDocumentIds = useMemo(() => {
        return groupedCompletedByDate.flatMap(group =>
            group.items.map(item => item.sourceDocument.id)
        );
    }, [groupedCompletedByDate]);

    // Selection mode
    const {
        selectionMode,
        setSelectionMode,
        selectedIds,
        toggleSelection,
        selectAll,
        clearSelection,
        isAllSelected,
    } = useSelectionMode(allSourceDocumentIds);

    // Batch actions
    const { batchUpdateDates, batchDelete, batchRetry } = useBatchSourceDocumentActions(ledgerId, clearSelection);

    // Handlers for batch actions
    const handleBatchUpdateDates = useCallback((date: string) => {
        batchUpdateDates.mutate({ ids: Array.from(selectedIds), entryDate: date });
    }, [batchUpdateDates, selectedIds]);

    const handleBatchDelete = useCallback(() => {
        batchDelete.mutate(Array.from(selectedIds));
    }, [batchDelete, selectedIds]);

    const handleBatchRetry = useCallback(() => {
        batchRetry.mutate(Array.from(selectedIds));
    }, [batchRetry, selectedIds]);

    return (
        <LayoutGroup id={layoutGroupId}>
            <PullToRefresh onRefresh={handleRefresh}>
                <div className="space-y-4" {...containerProps}>
                    {/* Filter Panel */}
                    <div className="px-2 mb-2 sm:mb-4 flex items-center gap-2">
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
                        >
                            {selectionMode ? <X className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
                        </Button>
                        <EntryFilterPanel
                            filters={filters}
                            onFiltersChange={onFiltersChange}
                            periodParams={periodParams}
                            onPeriodChange={onPeriodChange}
                            showCategory={false}
                            showCurrency={false}
                            monthStartDay={monthStartDay}
                            className="w-auto"
                        />
                        <span className="text-xs text-muted-foreground font-mono ml-auto">
                            {tFilter("filteredTotal")} {mainCurrency} {filteredTotal.toFixed(2)}
                        </span>
                    </div>

                    {/* Unified Loading State */}
                    {isLoading ? (
                        <div className="space-y-6 px-1 animate-pulse">
                            {/* Skeleton for source document cards */}
                            {[1, 2, 3].map((idx) => (
                                <div key={idx} className="bg-surface rounded-xl border border-border overflow-hidden">
                                    {/* Card header skeleton */}
                                    <div className="px-4 py-3 bg-surface2/50 border-b border-border flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="h-4 w-4 bg-border rounded" />
                                            <div className="h-3 w-28 bg-border rounded" />
                                            <div className="h-3 w-1 bg-border rounded" />
                                            <div className="h-3 w-20 bg-border rounded" />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="h-4 w-16 bg-border rounded" />
                                            <div className="h-7 w-7 bg-border rounded" />
                                        </div>
                                    </div>
                                    {/* Card content skeleton - entries */}
                                    <div className="border-t border-border p-3 space-y-3 bg-surface2/30">
                                        {[1, 2].map((entryIdx) => (
                                            <div key={entryIdx} className="flex items-center justify-between py-1">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-full bg-border" />
                                                    <div className="space-y-1">
                                                        <div className="h-4 w-24 bg-border rounded" />
                                                        <div className="h-3 w-16 bg-border rounded" />
                                                    </div>
                                                </div>
                                                <div className="h-4 w-14 bg-border rounded" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <>
                            {/* Completed Section - Only show processed bills */}
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
                                                        {ledger?.metadata?.settings?.mainCurrency || 'CNY'} {dateGroup.total.toFixed(2)}
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
                                                                mainCurrency={ledger?.metadata?.settings?.mainCurrency}
                                                                onUpdateLedgerEntry={handleUpdateLedgerEntry}
                                                                onViewLedgerEntry={handleViewLedgerEntry}
                                                                onViewDetails={() => handleViewSourceDetail(group)}
                                                                onRetry={() => handleRetry(group.sourceDocument)}
                                                                onDelete={() => handleDeleteSourceConfirm(group.sourceDocument)}
                                                                status={(group.sourceDocument.status || "completed") as SourceDocumentStatusType}
                                                                anomalyReason={group.sourceDocument.anomalyReason}
                                                                selectionMode={selectionMode}
                                                                isSelected={selectedIds.has(group.sourceDocument.id)}
                                                                onToggleSelect={() => toggleSelection(group.sourceDocument.id)}
                                                            />
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                )}
                            </div>

                            {/* Infinite scroll sentinel & loading indicator */}
                            <div ref={sentinelRef} className="h-1" />
                            {isFetchingNextPage && (
                                <div className="flex justify-center py-4">
                                    <span className="text-sm text-muted-foreground">{tCommon("loading")}</span>
                                </div>
                            )}
                            {!hasNextPage && groupedCompletedByDate.length > 0 && (
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
                    selectedCount={selectedIds.size}
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
