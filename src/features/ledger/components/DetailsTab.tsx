import { useState, useMemo, useTransition } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { getLedgerEntriesAction } from "@/features/ledger/server/actions/entries";
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats"; // New Action
import { updateLedgerEntryAction, deleteLedgerEntryAction } from "@/features/ledger/server/actions/entries";
import { LedgerEntry, EntryCategory, Ledger } from "@/types/api";
import { LedgerEntryCard } from "./LedgerEntryCard";
import { LedgerEntryDetailModal } from "./LedgerEntryDetailModal";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";

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
    useQueryClient();


    const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>(() => {
        const now = new Date();
        return {
            start: new Date(now.getFullYear(), now.getMonth(), 1),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        };
    });

    const startDateStr = dateRange.start?.toISOString();
    const endDateStr = dateRange.end?.toISOString();

    const { data: summaryData } = useQuery({
        queryKey: ["ledgerEntries", ledgerId, "summary", startDateStr, endDateStr, ledger?.mainCurrency],
        queryFn: () => getLedgerStatsAction(ledgerId, startDateStr, endDateStr, ledger?.mainCurrency),
        enabled: !!startDateStr && !!endDateStr
    });

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
    } = useInfiniteQuery({
        queryKey: ["ledgerEntries", ledgerId, "confirmed", startDateStr, endDateStr],
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
        const mainCurrency = convertedTotal?.currency || ledger?.mainCurrency || "CNY";
        const hasMultipleCurrencies = totals.length > 1;

        return {
            mainTotal,
            mainCurrency,
            hasMultipleCurrencies,
            breakdown: totals
        };
    }, [summaryData, ledger]);

    const [isPending, startTransition] = useTransition();

    const updateMutation = useMutation({
        mutationFn: async ({ ledgerEntryId, data }: { ledgerEntryId: string; data: any }) => {
            const result = await updateLedgerEntryAction(ledgerId, ledgerEntryId, data);
            if (!result.success) throw new Error(result.error);
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
    });

    const deleteMutation = useMutation({
        mutationFn: async (ledgerEntryId: string) => {
            const result = await deleteLedgerEntryAction(ledgerId, ledgerEntryId);
            if (!result.success) throw new Error(result.error);
        },
        onSuccess: () => {
            // Invalidation handled by Server Action revalidatePath + SSE
            toast.success(tLedger("deleteSuccess"));
        },
    });

    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
    const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<LedgerEntry | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const groupedItems = useMemo(() => {
        const sortedEntries = [...monthEntries].sort((a, b) => {
            const dateA = new Date(a.entryDate || a.createdAt).getTime();
            const dateB = new Date(b.entryDate || b.createdAt).getTime();
            return dateB - dateA;
        });

        const groups: Record<string, { timestamp: number; title: string; items: LedgerEntry[] }> = {};

        sortedEntries.forEach(entry => {
            const date = new Date(entry.entryDate || entry.createdAt);
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            let dateKey = "";
            let sortTimestamp = 0;

            const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            sortTimestamp = midnight.getTime();

            if (date.toDateString() === today.toDateString()) {
                dateKey = t("today");
            } else if (date.toDateString() === yesterday.toDateString()) {
                dateKey = t("yesterday");
            } else {
                dateKey = date.toLocaleDateString(locale, { month: "long", day: "numeric", weekday: "long" });
            }

            if (!groups[dateKey]) {
                groups[dateKey] = {
                    title: dateKey,
                    timestamp: sortTimestamp,
                    items: []
                };
            }
            groups[dateKey].items.push(entry);
        });

        return Object.values(groups).sort((a, b) => b.timestamp - a.timestamp);
    }, [monthEntries, t, locale]);

    return (
        <div className="space-y-0">
            <div className="sticky top-[3.5rem] z-20 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-3 sm:py-4 mb-2 border-b border-border/40">
                <div className="flex justify-between items-center px-2">
                    <div className="flex items-center gap-2">
                        <DateRangeFilter
                            startDate={dateRange.start}
                            endDate={dateRange.end}
                            onRangeChange={({ start, end }) => setDateRange({ start, end })}
                        />
                    </div>

                    <div className="flex flex-col items-end">
                        <div className="text-muted-foreground-foreground text-[10px] mb-0.5">{t("expenseSummary")}</div>
                        <div className="flex flex-col items-end">
                            <div className="text-xl font-bold font-mono tracking-tight leading-none">
                                {monthStats.hasMultipleCurrencies && (
                                    <span className="text-sm font-normal text-muted-foreground-foreground mr-1">≈</span>
                                )}
                                <span className="text-xs text-muted-foreground-foreground font-normal mr-1">{monthStats.mainCurrency}</span>
                                {monthStats.mainTotal.toFixed(2)}
                            </div>
                            {monthStats.hasMultipleCurrencies && (
                                <div className="text-[10px] text-muted-foreground-foreground font-mono mt-1 opacity-80">
                                    {monthStats.breakdown.map((b, idx) => (
                                        <span key={b.currency}>
                                            {idx > 0 && <span className="mx-1 opacity-50">·</span>}
                                            {b.currency || "?"} {b.total.toFixed(0)}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-8 pt-2">
                <AnimatePresence mode="popLayout">
                    {groupedItems.map((group) => (
                        <motion.div
                            key={group.title}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-2"
                        >
                            <div className="sticky top-[7.5rem] sm:top-[8rem] z-10 bg-bg/95 backdrop-blur py-2 px-2">
                                <h3 className="text-[10px] sm:text-xs font-medium text-muted-foreground flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50"></span>
                                    {group.title}
                                </h3>
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
                                            mainCurrency={ledger?.mainCurrency}
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
                            <span className="opacity-50 text-xs">{tLedger("noMore")}</span>
                        )}
                    </div>
                )}

                {isLoading ? (
                    <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-2">
                        <span className="w-6 h-6 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin"></span>
                        <span>{tCommon("loading")}</span>
                    </div>
                ) : monthEntries.length === 0 && (
                    <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-2">
                        <span className="text-4xl opacity-20">📭</span>
                        <span>{t("noExpenses")}</span>
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
                preferredCurrencies={ledger?.currencies}
                mainCurrency={ledger?.mainCurrency}
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
            />
        </div>
    );
}
