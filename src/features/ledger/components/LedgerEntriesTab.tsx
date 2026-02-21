import { useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { invalidateLedgerCache } from "@/lib/query-keys";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { PeriodParams, periodToDateRange } from "@/lib/period-utils";
import { useLedgerEntriesMutations } from "@/features/ledger/client/hooks/useLedgerEntriesMutations";
import { usePrefetchAdjacentPeriods } from "@/features/ledger/client/hooks/usePrefetchAdjacentPeriods";

interface LedgerEntriesTabProps {
    ledgerId: string;
    categories: EntryCategory[];
    ledger?: Ledger;
    periodParams: PeriodParams;
    onPeriodChange: (params: PeriodParams) => void;
    onFiltersChange: (filters: EntryFilters) => void;
}

export function LedgerEntriesTab({
    ledgerId,
    categories,
    ledger,
    periodParams,
    onPeriodChange,
    onFiltersChange,
}: LedgerEntriesTabProps) {
    const t = useTranslations("LedgerEntriesTab");
    const tDetails = useTranslations("DetailsTab");
    const tCommon = useTranslations("Common");
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

        const mainCurrency = ledger?.metadata?.settings?.mainCurrency || 'CNY';

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

    return (
        <LayoutGroup id={layoutGroupId}>
            <PullToRefresh onRefresh={handleRefresh}>
                <div className="space-y-4" {...containerProps}>
                    {/* Filter Panel */}
                    <div className="px-2 mb-2 sm:mb-4 pt-1">
                        <EntryFilterPanel
                            filters={filters}
                            onFiltersChange={onFiltersChange}
                            periodParams={periodParams}
                            onPeriodChange={onPeriodChange}
                            showCategory={false}
                            showCurrency={false}
                            className="w-full sm:w-auto"
                        />
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
                            <div className="space-y-6 px-2">
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
                                                <div className="py-2 px-2 flex items-center gap-3">
                                                    <h3 className="text-[10px] sm:text-xs font-medium text-muted-foreground flex items-center gap-2">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-primary/50"></span>
                                                        {dateGroup.title}
                                                    </h3>
                                                    <span className="text-[10px] sm:text-xs text-muted-foreground/50">·</span>
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
                                                            />
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                )}
                            </div>

                            {/* Load More Button */}
                            {hasNextPage && (
                                <div className="flex justify-center py-4">
                                    <button
                                        onClick={() => fetchNextPage()}
                                        disabled={isFetchingNextPage}
                                        className="px-4 py-2 text-sm font-medium text-primary hover:text-primary/80 disabled:opacity-50"
                                    >
                                        {isFetchingNextPage ? tCommon("loading") : t("loadMore")}
                                    </button>
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
