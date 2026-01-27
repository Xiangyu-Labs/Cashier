import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTransactions, updateTransaction, deleteTransaction } from "@/lib/api";
import { Transaction, Category } from "@/types/api";
import { TransactionCard } from "@/components/transaction/TransactionCard";
import { MonthPicker } from "@/components/ui/month-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface DetailsTabProps {
    ledgerId: string;
    categories: Category[];
}

export function DetailsTab({ ledgerId, categories }: DetailsTabProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // Calculate start and end of the selected month
    const { startDate, endDate } = useMemo(() => {
        const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);
        return { startDate: start, endDate: end };
    }, [currentDate]);

    // Fetch confirmed transactions for the selected month
    const { data: monthTransactions = [] } = useQuery({
        queryKey: ["transactions", ledgerId, "confirmed", startDate.toISOString(), endDate.toISOString()],
        queryFn: () => fetchTransactions(ledgerId, {
            status: "confirmed",
            limit: 1000,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
        }),
    });

    // Calculate Summary Stats
    const monthStats = useMemo(() => {
        const total = monthTransactions.reduce((sum: number, tx: Transaction) => sum + parseFloat(tx.amount || "0"), 0);
        const currency = monthTransactions.find((tx: Transaction) => tx.currency)?.currency || "CNY";
        return { total, currency };
    }, [monthTransactions]);

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
            toast({ variant: "success", title: "删除成功", description: "记录已删除" });
        },
    });

    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

    // Group items by date - Refactored to ensure strict sorting
    const groupedItems = useMemo(() => {
        // First, ensure all transactions are sorted by date (newest first)
        const sortedTransactions = [...monthTransactions].sort((a, b) => {
            const dateA = new Date(a.transactionDate || a.createdAt).getTime();
            const dateB = new Date(b.transactionDate || b.createdAt).getTime();
            return dateB - dateA;
        });

        // Group them
        const groups: Record<string, { timestamp: number; title: string; items: Transaction[] }> = {};

        sortedTransactions.forEach(tx => {
            const date = new Date(tx.transactionDate || tx.createdAt);
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            let dateKey = "";
            let sortTimestamp = 0; // Use midnight timestamp for sorting groups

            // Normalize to midnight for consistent grouping
            const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            sortTimestamp = midnight.getTime();

            if (date.toDateString() === today.toDateString()) {
                dateKey = "今天";
            } else if (date.toDateString() === yesterday.toDateString()) {
                dateKey = "昨天";
            } else {
                dateKey = date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
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

        // Convert to array and sort groups by timestamp descending
        return Object.values(groups).sort((a, b) => b.timestamp - a.timestamp);
    }, [monthTransactions]);

    return (
        <div className="space-y-0">
            {/* Header: Month Picker and Summary */}
            <div className="sticky top-14 z-[1] bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-4 mb-2 border-b border-border/40">
                <div className="flex justify-between items-center px-2">
                    <div className="flex items-center gap-2">
                        <MonthPicker date={currentDate} onDateChange={setCurrentDate} />
                    </div>

                    <div className="flex flex-col items-end">
                        <div className="text-muted-foreground text-[10px] mb-0.5">本月支出 ({monthStats.currency})</div>
                        <div className="text-xl font-bold font-mono tracking-tight">{monthStats.total.toFixed(2)}</div>
                    </div>
                </div>
            </div>

            <div className="space-y-8 pt-2">
                <AnimatePresence mode="popLayout">
                    {groupedItems.map((group) => (
                        <motion.div
                            key={group.title}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-2"
                        >
                            <div className="sticky top-[8rem] z-10 bg-bg/95 backdrop-blur py-2 px-2">
                                <h3 className="text-xs font-medium text-muted flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50"></span>
                                    {group.title}
                                </h3>
                            </div>
                            <div className="space-y-4 px-2">
                                {group.items.map((tx) => (
                                    <motion.div
                                        key={tx.id}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                    >
                                        <TransactionCard
                                            transaction={tx}
                                            categories={categories}
                                            onUpdate={(data) => updateMutation.mutate({ transactionId: tx.id, data })}
                                            onDelete={() => setDeleteConfirm({ open: true, id: tx.id })}
                                        />
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {monthTransactions.length === 0 && (
                    <div className="text-center py-20 text-muted flex flex-col items-center gap-2">
                        <span className="text-4xl opacity-20">📭</span>
                        <span>本月暂无支出</span>
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={deleteConfirm.open}
                onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
                title="确认删除"
                description="确定要删除这条交易吗？此操作无法撤销。"
                onConfirm={() => {
                    if (deleteConfirm.id) deleteMutation.mutate(deleteConfirm.id);
                    setDeleteConfirm({ open: false, id: null });
                }}
                variant="destructive"
                confirmLabel="删除"
            />
        </div>
    );
}
