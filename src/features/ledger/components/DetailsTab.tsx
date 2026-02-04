"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { getLedgerEntriesAction } from "@/features/ledger/server/actions/entries";
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats";
import { updateLedgerEntryAction, deleteLedgerEntryAction } from "@/features/ledger/server/actions/entries";
import { queryKeys } from "@/lib/query-keys";
import { LedgerEntry, EntryCategory, Ledger } from "@/types/api";
import { LedgerEntryCard } from "./LedgerEntryCard";
import { LedgerEntryDetailModal } from "./LedgerEntryDetailModal";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { useBatchConvertedAmounts } from "@/features/currency/client/hooks/useBatchConvertedAmounts";

interface DetailsTabProps {
    ledgerId: string;
    categories: EntryCategory[];
    ledger?: Ledger;
}

export function DetailsTab({ ledgerId, categories, ledger }: DetailsTabProps) {
    const t = useTranslations("DetailsTab");
    const tLedger = useTranslations("LedgerEntriesTab");
    const tCommon = useTranslations("Common");
    const locale = useLocale();
    const queryClient = useQueryClient();
    const push = useModalStackStore(state => state.push);


    // Use undefined initially to avoid SSR/Hydration mismatch for date initialization
    const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>({});

    // Initialize date range on client side to avoid SSR timezone issues
    useEffect(() => {
        const now = new Date();
        setDateRange({
            start: new Date(now.getFullYear(), now.getMonth(), 1),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        });
    }, []);

    const startDateStr = formatDateTimeForApi(dateRange.start);
    const endDateStr = formatDateTimeForApi(dateRange.end);

    const { data: summaryData } = useQuery({
        queryKey: queryKeys.ledgerEntries(ledgerId, 'summary', startDateStr, endDateStr, ledger?.metadata?.settings?.mainCurrency),
        queryFn: () => getLedgerStatsAction(ledgerId, startDateStr, endDateStr, ledger?.metadata?.settings?.mainCurrency || undefined),
        enabled: !!startDateStr && !!endDateStr
    });

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
    } = useInfiniteQuery({
        queryKey: queryKeys.ledgerEntries(ledgerId, 'confirmed', startDateStr, endDateStr),
        queryFn: ({ pageParam }) => getLedgerEntriesAction(ledgerId, {
            limit: 20,
            startDate: startDateStr,
            endDate: endDateStr,
            cursor: pageParam as string | undefined
        }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        enabled: !!startDateStr && !!endDateStr
    });

    const monthEntries = useMemo(() => {
        return data?.pages.flatMap(p => p.items.map(item => ({
            ...item,
            sourceDocument: item.sourceDocument ? {
                ...item.sourceDocument,
                imageUrls: item.sourceDocument.imageUrls || []
            } : item.sourceDocument
        }))) || [];
    }, [data]);

    const monthStats = useMemo(() => {
        const convertedTotal = summaryData?.convertedTotal;
        const totals = summaryData?.totals || [];

        const mainTotal = convertedTotal?.total ?? totals.reduce((sum, t) => sum + t.total, 0);
        const mainCurrency = convertedTotal?.currency || ledger?.metadata?.settings?.mainCurrency || "CNY";
        const hasMultipleCurrencies = totals.length > 1;

        return {
            mainTotal,
            mainCurrency,
            hasMultipleCurrencies,
            breakdown: totals
        };
    }, [summaryData, ledger]);

    const updateMutation = useMutation({
        mutationFn: async ({ ledgerEntryId, data }: { ledgerEntryId: string; data: Partial<Omit<LedgerEntry, 'amount'>> & { amount?: number } }) => {
            const result = await updateLedgerEntryAction(ledgerId, ledgerEntryId, data);
            if (!result.success) throw new Error(result.error || "Unknown error");
            return result.data as LedgerEntry;
        },
        onSuccess: (updatedEntry) => {
            // Invalidation handled by Server Action revalidatePath + SSE
            toast.success(tCommon("saveSuccess"));
            // Update selected entry if it's the one being edited to reflect changes in modal
            if (selectedLedgerEntry && selectedLedgerEntry.id === updatedEntry.id) {
                setSelectedLedgerEntry({
                    ...updatedEntry,
                    category: categories.find(c => c.id === updatedEntry.categoryId) || null,
                    sourceDocument: selectedLedgerEntry.sourceDocument
                });
            }
        },
        onError: () => {
            toast.error(tCommon("saveFailed"));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.ledgerEntries(ledgerId) });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (ledgerEntryId: string) => {
            const result = await deleteLedgerEntryAction(ledgerId, ledgerEntryId);
            if (!result.success) throw new Error(result.error || "Unknown error");
        },
        onSuccess: () => {
            toast.success(tLedger("deleteSuccess"));
            setIsDetailModalOpen(false);
            setSelectedLedgerEntry(null);
        },
        onError: () => toast.error(tCommon("deleteFailed")),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.ledgerEntries(ledgerId) });
        },
    });

    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
    const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<LedgerEntry | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    // Helper to get date string (yyyy-MM-dd) from entry
    const getDateStr = (entry: LedgerEntry) => {
        if (entry.entryDate) return entry.entryDate;
        return new Date(entry.createdAt).toLocaleDateString('sv');
    };

    // Prepare batch conversion items for all entries
    const conversionItems = useMemo(() =>
        monthEntries.map(entry => ({
            amount: Number(entry.amount),
            currency: entry.currency || monthStats.mainCurrency,
            date: getDateStr(entry)
        })),
        [monthEntries, monthStats.mainCurrency]
    );

    // Batch convert all amounts to main currency
    const { results: convertedAmounts } = useBatchConvertedAmounts(
        conversionItems,
        monthStats.mainCurrency
    );

    const groupedItems = useMemo(() => {
        const sortedEntries = [...monthEntries].sort((a, b) => {
            const dateA = getDateStr(a);
            const dateB = getDateStr(b);
            return dateB.localeCompare(dateA);
        });

        // Build index map: entry id -> original index in monthEntries (for converted amounts)
        const indexMap = new Map(monthEntries.map((e, i) => [e.id, i]));

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

            // Use converted amount for total calculation
            const originalIndex = indexMap.get(entry.id);
            const convertedAmount = originalIndex !== undefined ? convertedAmounts[originalIndex] : Number(entry.amount);
            groups[dateKey].total += convertedAmount;
            groups[dateKey].items.push(entry);
        });

        return Object.values(groups).sort((a, b) => b.timestamp - a.timestamp);
    }, [monthEntries, t, locale, convertedAmounts]);

    const handleRefresh = async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.ledgerEntries(ledgerId) });
    };

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="space-y-4">
                {/* Header Section - Responsive layout */}
                <div className="px-2 mb-2 sm:mb-4 pt-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                        {/* Date Range Filter - Full width on mobile */}
                        <DateRangeFilter
                            startDate={dateRange.start}
                            endDate={dateRange.end}
                            onRangeChange={({ start, end }) => setDateRange({ start, end })}
                            className="w-full sm:w-auto"
                        />

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
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.15 }}
                                        >
                                            <LedgerEntryCard
                                                ledgerEntry={entry}
                                                categories={categories}
                                                mainCurrency={ledger?.metadata?.settings?.mainCurrency || undefined}
                                                onView={() => {
                                                    setSelectedLedgerEntry(entry);
                                                    setIsDetailModalOpen(true);
                                                }}
                                            />
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {monthEntries.length > 0 && (
                        <div className="h-10 flex items-center justify-center text-muted-foreground text-sm pb-4">
                            {isFetchingNextPage ? (
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse"></span>
                                    <span>{tCommon("loading")}</span>
                                </div>
                            ) : hasNextPage ? (
                                <motion.div onViewportEnter={() => fetchNextPage()} className="w-full h-full flex items-center justify-center cursor-pointer" onClick={() => fetchNextPage()}>
                                    <span>{tLedger("loadMore")}</span>
                                </motion.div>
                            ) : (
                                <span className="opacity-50 text-xs">{tCommon("noMore")}</span>
                            )}
                        </div>
                    )}

                    {isLoading ? (
                        <div className="space-y-6 pt-2 animate-pulse">
                            {/* Skeleton for date group */}
                            {[1, 2].map((groupIdx) => (
                                <div key={groupIdx} className="space-y-2">
                                    {/* Date header skeleton */}
                                    <div className="py-2 px-2 flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-border" />
                                        <div className="h-3 w-24 bg-border rounded" />
                                        <div className="h-3 w-1 bg-border rounded" />
                                        <div className="h-3 w-16 bg-border rounded" />
                                    </div>
                                    {/* Entry card skeletons */}
                                    <div className="space-y-4 px-2">
                                        {[1, 2, 3].map((idx) => (
                                            <div key={idx} className="rounded-xl border border-border bg-surface p-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-8 w-8 rounded-full bg-border" />
                                                        <div className="space-y-1.5">
                                                            <div className="h-4 w-28 bg-border rounded" />
                                                            <div className="h-3 w-20 bg-border rounded" />
                                                        </div>
                                                    </div>
                                                    <div className="h-4 w-16 bg-border rounded" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : monthEntries.length === 0 && (
                        <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-2">
                            <span>{tCommon("noRecords")}</span>
                        </div>
                    )}
                </div>

                <ConfirmDialog
                    open={deleteConfirm.open}
                    onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
                    title={tLedger("deleteConfirmTitle")}
                    description={tLedger("deleteConfirmDesc")}
                    onConfirm={() => {
                        if (deleteConfirm.id) deleteMutation.mutate(deleteConfirm.id);
                        setDeleteConfirm({ open: false, id: null });
                    }}
                    variant="destructive"
                    confirmLabel={tCommon("delete")}
                />

                <LedgerEntryDetailModal
                    ledgerEntry={selectedLedgerEntry}
                    categories={categories}
                    preferredCurrencies={ledger?.metadata?.settings?.currencies || []}
                    mainCurrency={ledger?.metadata?.settings?.mainCurrency || undefined}
                    open={isDetailModalOpen}
                    onClose={() => {
                        setIsDetailModalOpen(false);
                        setSelectedLedgerEntry(null);
                    }}
                    onUpdate={(data) => {
                        if (selectedLedgerEntry) {
                            updateMutation.mutate({
                                ledgerEntryId: selectedLedgerEntry.id,
                                data,
                            });
                        }
                    }}
                    onDelete={() => {
                        if (selectedLedgerEntry) {
                            deleteMutation.mutate(selectedLedgerEntry.id);
                        }
                    }}
                    onViewSourceDocument={selectedLedgerEntry?.sourceDocumentId ? (sourceDocumentId) => {
                        setIsDetailModalOpen(false);
                        setSelectedLedgerEntry(null);
                        push({ type: 'source-document', id: sourceDocumentId });
                    } : undefined}
                />
            </div>
        </PullToRefresh>
    );
}
