import { useState, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    updateLedgerEntryAction,
    deleteLedgerEntryAction,
} from "@/features/ledger/server/actions/entries";
import {
    deleteSourceDocumentAction,
    batchDeleteSourceDocumentsAction,
} from "@/features/source-document/server/actions";
import { LedgerEntry, EntryCategory, SourceDocument, Ledger } from "@/types/api";
import { SourceDocumentCard } from "@/features/source-document/components/SourceDocumentCard";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { SourceDocumentEditRetryDialog } from "./SourceDocumentEditRetryDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { EntryFilterPanel, EntryFilters } from "./EntryFilterPanel";
import { useTranslations, useLocale } from "next-intl";
import { useUnifiedSourceDocuments, SourceDocumentGroup } from "@/features/source-document/client/hooks/useUnifiedSourceDocuments";
import { useLayoutTransition } from "@/hooks/useLayoutTransition";
import { queryKeys, invalidateLedgerCache } from "@/lib/query-keys";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/i18n/routing";
import { PeriodParams, PeriodPreset, periodToDateRange } from "@/lib/period-utils";

interface LedgerEntriesTabProps {
    ledgerId: string;
    categories: EntryCategory[];
    ledger?: Ledger;
    initialPeriod: PeriodParams;
}

export function LedgerEntriesTab({
    ledgerId,
    categories,
    ledger,
    initialPeriod,
}: LedgerEntriesTabProps) {
    const t = useTranslations("LedgerEntriesTab");
    const tDetails = useTranslations("DetailsTab");
    const tCommon = useTranslations("Common");
    const locale = useLocale();
    const queryClient = useQueryClient();
    const pathname = usePathname();
    const searchParams = useSearchParams();


    // Layout Transitions
    const { containerProps, getItemProps, layoutGroupId } = useLayoutTransition();

    // Period state - initialized from URL (via props), no useEffect needed
    const [periodParams, setPeriodParams] = useState<PeriodParams>(initialPeriod);

    // Compute date range from period (memoized)
    const dateRange = useMemo(() => periodToDateRange(periodParams), [periodParams]);

    // Convert to EntryFilters format for compatibility
    const filters: EntryFilters = useMemo(() => ({
        startDate: dateRange.startDate ? new Date(dateRange.startDate) : undefined,
        endDate: dateRange.endDate ? new Date(dateRange.endDate) : undefined,
    }), [dateRange]);

    // Handle period change - update both state and URL
    const handlePeriodChange = useCallback((newPeriod: PeriodParams) => {
        setPeriodParams(newPeriod);

        // Update URL without navigation
        const params = new URLSearchParams(searchParams.toString());
        params.set('period', newPeriod.period);

        if (newPeriod.period === 'custom') {
            if (newPeriod.startDate) params.set('startDate', newPeriod.startDate);
            if (newPeriod.endDate) params.set('endDate', newPeriod.endDate);
        } else {
            params.delete('startDate');
            params.delete('endDate');
        }

        window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
    }, [pathname, searchParams]);

    // Handle filter changes from EntryFilterPanel (for advanced filters like amount)
    const handleFiltersChange = useCallback((newFilters: EntryFilters) => {
        // If date changed, update period to custom
        if (newFilters.startDate || newFilters.endDate) {
            const formatDate = (d?: Date): string | undefined => {
                if (!d) return undefined;
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
            };
            handlePeriodChange({
                period: 'custom',
                startDate: formatDate(newFilters.startDate),
                endDate: formatDate(newFilters.endDate),
            });
        } else {
            // No dates means "all"
            handlePeriodChange({ period: 'all' });
        }
    }, [handlePeriodChange]);

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

    // --- Mutations ---

    const updateMutation = useMutation({
        mutationFn: async ({ ledgerEntryId, data }: { ledgerEntryId: string; data: Partial<Omit<LedgerEntry, 'amount'>> & { amount?: number } }) => {
            return await updateLedgerEntryAction(ledgerId, ledgerEntryId, data) as unknown as LedgerEntry;
        },
        onMutate: async ({ ledgerEntryId, data }) => {
            // Cancel in-flight queries
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot for rollback
            const prevData = queryClient.getQueriesData({ queryKey: queryKeys.sourceDocuments(ledgerId) });

            // Optimistic update: update the entry in unified source documents
            queryClient.setQueriesData<{ groups?: { processing?: SourceDocumentGroup[]; anomaly?: SourceDocumentGroup[]; completed?: SourceDocumentGroup[] } }>(
                { queryKey: queryKeys.sourceDocuments(ledgerId) },
                (old) => {
                    if (!old?.groups) return old;
                    const updateEntries = (groups: SourceDocumentGroup[] | undefined): SourceDocumentGroup[] | undefined =>
                        groups?.map(group => ({
                            ...group,
                            ledgerEntries: group.ledgerEntries.map(e =>
                                e.id === ledgerEntryId
                                    ? {
                                        ...e,
                                        ...data,
                                        // Ensure amount stays as string type
                                        amount: data.amount !== undefined ? String(data.amount) : e.amount,
                                        category: data.categoryId
                                            ? categories.find(c => c.id === data.categoryId) || e.category
                                            : e.category
                                    } as LedgerEntry
                                    : e
                            )
                        }));
                    return {
                        ...old,
                        groups: {
                            processing: updateEntries(old.groups.processing),
                            anomaly: updateEntries(old.groups.anomaly),
                            completed: updateEntries(old.groups.completed),
                        }
                    };
                }
            );

            return { prevData };
        },
        onSuccess: () => {
            toast.success(tCommon("saveSuccess"));
        },
        onError: (_err, _vars, ctx) => {
            // Rollback
            if (ctx?.prevData) {
                ctx.prevData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
            toast.error(tCommon("saveFailed"));
        },
        onSettled: () => queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) })
    });

    const deleteLedgerEntryMutation = useMutation({
        mutationFn: async (ledgerEntryId: string) => {
            await deleteLedgerEntryAction(ledgerId, ledgerEntryId);
        },
        onMutate: async (ledgerEntryId) => {
            // Cancel in-flight queries to prevent race conditions
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot current state for rollback
            const prevUnified = queryClient.getQueryData(queryKeys.sourceDocuments(ledgerId, 'unified'));

            // Optimistic update: remove the entry from unified source documents
            queryClient.setQueriesData<{ groups?: { processing?: SourceDocumentGroup[]; anomaly?: SourceDocumentGroup[]; completed?: SourceDocumentGroup[] } }>(
                { queryKey: queryKeys.sourceDocuments(ledgerId) },
                (old) => {
                    if (!old?.groups) return old;
                    return {
                        ...old,
                        groups: {
                            processing: old.groups.processing?.map(group => ({
                                ...group,
                                ledgerEntries: group.ledgerEntries.filter(e => e.id !== ledgerEntryId)
                            })),
                            anomaly: old.groups.anomaly?.map(group => ({
                                ...group,
                                ledgerEntries: group.ledgerEntries.filter(e => e.id !== ledgerEntryId)
                            })),
                            completed: old.groups.completed?.map(group => ({
                                ...group,
                                ledgerEntries: group.ledgerEntries.filter(e => e.id !== ledgerEntryId)
                            })),
                        }
                    };
                }
            );

            return { prevUnified };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            setDeleteConfirm({ ...deleteConfirm, open: false });
        },
        onError: (_err, _id, ctx) => {
            // Rollback on error
            if (ctx?.prevUnified) {
                queryClient.setQueryData(queryKeys.sourceDocuments(ledgerId, 'unified'), ctx.prevUnified);
            }
            toast.error(tCommon("deleteFailed"));
        },
        onSettled: () => queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) })
    });

    // Simplified mutations by removing unused batch ones for now (lint)

    const deleteSourceDocumentMutation = useMutation({
        mutationFn: async (sourceDocumentId: string) => {
            await deleteSourceDocumentAction(ledgerId, sourceDocumentId);
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.sourceDocuments(ledgerId) });
            const prevActive = queryClient.getQueryData(queryKeys.sourceDocuments(ledgerId, "active"));

            queryClient.setQueryData<SourceDocument[]>(queryKeys.sourceDocuments(ledgerId, "active"), (old) =>
                old?.filter(d => d.id !== id) || []
            );

            return { prevActive };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            setDeleteConfirm({ ...deleteConfirm, open: false });
        },
        onError: (err, id, ctx) => {
            queryClient.setQueryData(queryKeys.sourceDocuments(ledgerId, "active"), ctx?.prevActive);
            toast.error(t("deleteFailed"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
        }
    });

    // retryMutation was redundant here, removed.

    const batchDeleteSourceDocsMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            await batchDeleteSourceDocumentsAction(ledgerId, ids);
        },
        onMutate: async (ids) => {
            await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });

            // Snapshot for rollback
            const prevData = queryClient.getQueriesData({ queryKey: queryKeys.sourceDocuments(ledgerId) });

            // Optimistic update: remove all documents with matching IDs
            queryClient.setQueriesData<{ groups?: { processing?: SourceDocumentGroup[]; anomaly?: SourceDocumentGroup[]; completed?: SourceDocumentGroup[] } }>(
                { queryKey: queryKeys.sourceDocuments(ledgerId) },
                (old) => {
                    if (!old?.groups) return old;
                    const filterDocs = (groups: SourceDocumentGroup[] | undefined) =>
                        groups?.filter(g => !ids.includes(g.sourceDocument.id));
                    return {
                        ...old,
                        groups: {
                            processing: filterDocs(old.groups.processing),
                            anomaly: filterDocs(old.groups.anomaly),
                            completed: filterDocs(old.groups.completed),
                        }
                    };
                }
            );

            return { prevData };
        },
        onSuccess: () => {
            toast.success(tCommon("deleteSuccess"));
            if (deleteConfirm.open) setDeleteConfirm({ ...deleteConfirm, open: false });
        },
        onError: (_err, _ids, ctx) => {
            // Rollback
            if (ctx?.prevData) {
                ctx.prevData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
            toast.error(tCommon("deleteFailed"));
        },
        onSettled: () => queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) })
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
        updateMutation.mutate({ ledgerEntryId: id, data });
    }, [updateMutation]);

    const handleViewLedgerEntry = useCallback((entry: LedgerEntry) => {
        pushModal({ type: 'ledger-entry', id: entry.id });
    }, [pushModal]);

    // Removed unused handlers: handleUpdateTitle, handleBatchUpdate, handleDeleteEntryRequest, handleBatchDelete, handleUpdateLedgerEntryDetail, handleDeleteLedgerEntryRequest

    // Helper Action Handlers
    function handleDeleteConfirmAction() {
        if (!deleteConfirm.id || !deleteConfirm.type) return;

        if (deleteConfirm.type === "sourceDocument") {
            deleteSourceDocumentMutation.mutate(deleteConfirm.id);
        } else if (deleteConfirm.type === "batch") {
            // For safety, batch delete currently only used for anomaly multiple selection which UI doesn't fully support yet mostly,
            // except "Delete All" button which we will implement below.
            // If ID is special "ALL_ERRORS", we handle it specifically or use a new mutation.
            // Wait, the previous logic used deleteSourceDocumentMutation in a loop.
        } else if (deleteConfirm.id === "ALL_ERRORS") {
            const ids = groups.anomaly.map((g: SourceDocumentGroup) => g.sourceDocument.id);
            batchDeleteSourceDocsMutation.mutate(ids);
        } else if (deleteConfirm.type === "ledgerEntry") {
            deleteLedgerEntryMutation.mutate(deleteConfirm.id);
        }

        setDeleteConfirm({ ...deleteConfirm, open: false });
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

            // Calculate total for this source document (sum of all ledger entries)
            const docTotal = group.ledgerEntries.reduce((sum, entry) => {
                // For now, just sum amounts directly (currency conversion would need more work)
                // If entry currency matches main currency, add directly
                if (entry.currency === mainCurrency || !entry.currency) {
                    return sum + Number(entry.amount);
                }
                // For different currencies, just add the amount (proper conversion would need batch conversion)
                return sum + Number(entry.amount);
            }, 0);

            dateGroups[dateKey].total += docTotal;
            dateGroups[dateKey].items.push(group);
        });

        return Object.values(dateGroups).sort((a, b) => b.timestamp - a.timestamp);
    }, [groups.completed, getSourceDocDateStr, tDetails, locale, ledger?.metadata?.settings?.mainCurrency]);

    // --- Main Render ---



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
                            onFiltersChange={handleFiltersChange}
                            periodParams={periodParams}
                            onPeriodChange={handlePeriodChange}
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
                                                                status="completed"
                                                                mainCurrency={ledger?.metadata?.settings?.mainCurrency || undefined}
                                                                defaultExpanded={!ledger?.metadata?.settings?.collapseBillsDefault}
                                                                onDelete={() => handleDeleteSourceConfirm(group.sourceDocument)}
                                                                onUpdateLedgerEntry={handleUpdateLedgerEntry}
                                                                onRetry={() => handleRetry(group.sourceDocument)}
                                                                onViewDetails={() => handleViewSourceDetail(group)}
                                                                onViewLedgerEntry={handleViewLedgerEntry}
                                                            />
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                )}

                                {/* Infinite Scroll Sentinel */}
                                <div className="h-10 flex items-center justify-center text-muted-foreground text-sm pb-4">
                                    {isFetchingNextPage ? (
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse"></span>
                                            <span>{tCommon("loading")}</span>
                                        </div>
                                    ) : hasNextPage ? (
                                        <motion.div onViewportEnter={() => fetchNextPage()} className="w-full h-full flex items-center justify-center cursor-pointer" onClick={() => fetchNextPage()}>
                                            <span>{t("loadMore")}</span>
                                        </motion.div>
                                    ) : (
                                        <span className="opacity-50 text-xs">{tCommon("noMore")}</span>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                </div>
            </PullToRefresh>

            {/* Global Modal Stack Renderer */}


            <ConfirmDialog
                open={deleteConfirm.open}
                onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
                title={deleteConfirm.title}
                description={deleteConfirm.description}
                onConfirm={handleDeleteConfirmAction}
                variant="destructive"
                confirmLabel={tCommon("delete")}
            />

            {/* Edit-Retry Dialog */}
            {retrySourceDocument && (
                <SourceDocumentEditRetryDialog
                    ledgerId={ledgerId}
                    sourceDocument={retrySourceDocument}
                    open={!!retrySourceDocument}
                    onOpenChange={(open) => !open && setRetrySourceDocument(null)}
                    onSuccess={() => {
                        toast.success(t("retrySubmitted"));
                        queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
                    }}
                />
            )}
        </LayoutGroup>
    );
}
