import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { fetchTransactions, updateTransaction, deleteTransaction, fetchTransactionSummary } from "@/lib/api";
import { Transaction, Category } from "@/types/api";
import { TransactionCard } from "@/components/transaction/TransactionCard";
import { TransactionDetailModal } from "@/components/TransactionDetailModal";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";

interface DetailsTabProps {
    ledgerId: string;
    categories: Category[];
}

export function DetailsTab({ ledgerId, categories }: DetailsTabProps) {
    const t = useTranslations("DetailsTab");
    const tTransactions = useTranslations("TransactionsTab");
    const tCommon = useTranslations("Common");
    const locale = useLocale();
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // Date Range Filter State (Default: Current Month)
    const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>(() => {
        const now = new Date();
        return {
            start: new Date(now.getFullYear(), now.getMonth(), 1),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        };
    });

    const startDateStr = dateRange.start?.toISOString();
    const endDateStr = dateRange.end?.toISOString();

    // Fetch Summary for the Month (Total)
    const { data: summaryData } = useQuery({
        queryKey: ["transactions", ledgerId, "summary", startDateStr, endDateStr],
        queryFn: () => fetchTransactionSummary(ledgerId, "confirmed", startDateStr, endDateStr),
        enabled: !!startDateStr && !!endDateStr
    });

    // Fetch confirmed transactions for the selected range (Infinite Scroll)
    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
    } = useInfiniteQuery({
        queryKey: ["transactions", ledgerId, "confirmed", startDateStr, endDateStr],
        queryFn: ({ pageParam }) => fetchTransactions(ledgerId, {
            status: "confirmed",
            limit: 20,
            startDate: startDateStr,
            endDate: endDateStr,
            cursor: pageParam
        }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        enabled: !!startDateStr && !!endDateStr
    });

    const monthTransactions = useMemo(() => {
        return data?.pages.flatMap(p => p.items) || [];
    }, [data]);

    // Calculate Summary Stats
    const monthStats = useMemo(() => {
        const total = summaryData?.totals.reduce((sum, t) => sum + t.total, 0) || 0;
        const currency = summaryData?.totals[0]?.currency || "CNY";
        return { total, currency };
    }, [summaryData]);

    const updateMutation = useMutation({
        mutationFn: ({ transactionId, data }: { transactionId: string; data: Parameters<typeof updateTransaction>[2] }) =>
            updateTransaction(ledgerId, transactionId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (transactionId: string) => deleteTransaction(ledgerId, transactionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
            toast({ variant: "success", title: tTransactions("deleteSuccess"), description: "" });
        },
    });

    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    // Group items by date - Refactored to ensure strict sorting
    const groupedItems = useMemo(() => {
        const sortedTransactions = [...monthTransactions].sort((a, b) => {
            const dateA = new Date(a.transactionDate || a.createdAt).getTime();
            const dateB = new Date(b.transactionDate || b.createdAt).getTime();
            return dateB - dateA;
        });

        const groups: Record<string, { timestamp: number; title: string; items: Transaction[] }> = {};

        sortedTransactions.forEach(tx => {
            const date = new Date(tx.transactionDate || tx.createdAt);
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
            groups[dateKey].items.push(tx);
        });

        return Object.values(groups).sort((a, b) => b.timestamp - a.timestamp);
    }, [monthTransactions, t, locale]);

    return (
        <div className="space-y-0">
            {/* Header: Month Picker and Summary */}
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
                        <div className="text-muted-foreground text-[10px] mb-0.5">{t("expenseSummary", { currency: monthStats.currency })}</div>
                        <div className="text-xl font-bold font-mono tracking-tight">{monthStats.total.toFixed(2)}</div>
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
                                <h3 className="text-[10px] sm:text-xs font-medium text-muted flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50"></span>
                                    {group.title}
                                </h3>
                            </div>
                            <div className="space-y-4 px-2">
                                {group.items.map((tx) => (
                                    <motion.div
                                        key={tx.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                    >
                                        <TransactionCard
                                            transaction={tx}
                                            categories={categories}
                                            onUpdate={(data) => updateMutation.mutate({ transactionId: tx.id, data })}
                                            onDelete={() => setDeleteConfirm({ open: true, id: tx.id })}
                                            onView={() => {
                                                setSelectedTransaction(tx);
                                                setIsDetailModalOpen(true);
                                            }}
                                        />
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Sentinel for Infinite Scroll */}
                {monthTransactions.length > 0 && (
                    <div className="h-10 flex items-center justify-center text-muted text-sm pb-4">
                        {isFetchingNextPage ? (
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse"></span>
                                <span>{tCommon("loading")}</span>
                            </div>
                        ) : hasNextPage ? (
                            <motion.div onViewportEnter={() => fetchNextPage()} className="w-full h-full flex items-center justify-center cursor-pointer" onClick={() => fetchNextPage()}>
                                <span>{tTransactions("loadMore")}</span>
                            </motion.div>
                        ) : (
                            <span className="opacity-50 text-xs">{tTransactions("noMore")}</span>
                        )}
                    </div>
                )}

                {isLoading ? (
                    <div className="text-center py-20 text-muted flex flex-col items-center gap-2">
                        <span className="w-6 h-6 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin"></span>
                        <span>{tCommon("loading")}</span>
                    </div>
                ) : monthTransactions.length === 0 && (
                    <div className="text-center py-20 text-muted flex flex-col items-center gap-2">
                        <span className="text-4xl opacity-20">📭</span>
                        <span>{t("noExpenses")}</span>
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={deleteConfirm.open}
                onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
                title={tTransactions("deleteConfirmTitle")}
                description={tTransactions("deleteConfirmDesc")}
                onConfirm={() => {
                    if (deleteConfirm.id) deleteMutation.mutate(deleteConfirm.id);
                    setDeleteConfirm({ open: false, id: null });
                }}
                variant="destructive"
                confirmLabel={tCommon("delete")}
            />

            <TransactionDetailModal
                transaction={selectedTransaction}
                categories={categories}
                open={isDetailModalOpen}
                onClose={() => {
                    setIsDetailModalOpen(false);
                    setSelectedTransaction(null);
                }}
                onUpdate={(data) => {
                    if (selectedTransaction) {
                        updateMutation.mutate({
                            transactionId: selectedTransaction.id,
                            data,
                        });
                    }
                }}
                onDelete={() => {
                    if (selectedTransaction) {
                        deleteMutation.mutate(selectedTransaction.id);
                    }
                }}
            />
        </div>
    );
}
