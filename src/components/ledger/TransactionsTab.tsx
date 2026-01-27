import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
    confirmTransactions,
    updateTransaction,
    deleteTransaction,
    retryReceipt,
    deleteReceipt,
    fetchReceipts,
} from "@/lib/api";
import { Transaction, Category, Receipt } from "@/types/api";
import { BatchTransactionCard } from "@/components/transaction/BatchTransactionCard";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface TransactionsTabProps {
    ledgerId: string;
    pendingGroups: {
        batches: { receipt: Receipt; transactions: Transaction[] }[];
        others: Transaction[];
    };
    confirmedGroups?: {
        batches: { receipt: Receipt; transactions: Transaction[] }[];
        others: Transaction[];
    };
    queuedReceipts?: Receipt[];
    categories: Category[];
    defaultCollapsed?: boolean;
}

// Helper types
type PinnedItem =
    | { type: "queue"; date: string; data: Receipt }
    | {
        type: "batch";
        status: "pending";
        date: string;
        data: { receipt: Receipt; transactions: Transaction[] };
    }
    | {
        type: "single";
        status: "pending";
        date: string;
        data: Transaction;
    };

export function TransactionsTab({
    ledgerId,
    pendingGroups,
    confirmedGroups,
    queuedReceipts = [],
    categories,
    defaultCollapsed = false,
}: TransactionsTabProps) {
    const queryClient = useQueryClient();
    const [confirmingAll, setConfirmingAll] = useState(false);
    const [isPendingConfirmationCollapsed, setIsPendingConfirmationCollapsed] = useState(defaultCollapsed);
    // Error section defaults to expanded as well
    const [isErrorCollapsed, setIsErrorCollapsed] = useState(defaultCollapsed);

    useEffect(() => {
        setIsPendingConfirmationCollapsed(defaultCollapsed);
        setIsErrorCollapsed(defaultCollapsed);
    }, [defaultCollapsed]);

    // Fetch ALL receipts for the main list (history view)
    const { data: rawReceipts = [] } = useQuery({
        queryKey: ["receipts", ledgerId, "all"],
        queryFn: () => fetchReceipts(ledgerId),
    });

    const allReceipts = rawReceipts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Create a map of receiptId -> transactions from confirmedGroups for fast lookup
    const confirmedTransactionsMap = new Map<string, Transaction[]>();
    if (confirmedGroups) {
        confirmedGroups.batches.forEach(batch => {
            confirmedTransactionsMap.set(batch.receipt.id, batch.transactions);
        });
    }

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
        },
    });

    const deleteReceiptMutation = useMutation({
        mutationFn: async (receiptId: string) => deleteReceipt(ledgerId, receiptId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["receipts", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
        },
        onError: () => {
            toast({ variant: "error", title: "删除失败", description: "无法删除记录，请稍后重试" });
        }
    });

    const { toast } = useToast();
    const [deleteConfirm, setDeleteConfirm] = useState<{
        open: boolean;
        type: "receipt" | "batch" | "transaction" | null;
        id: string | null;
        title: string;
        description: string;
    }>({ open: false, type: null, id: null, title: "", description: "" });

    const handleDeleteConfirm = () => {
        if (!deleteConfirm.id || !deleteConfirm.type) return;
        if (deleteConfirm.type === "receipt" || deleteConfirm.type === "batch") {
            deleteReceiptMutation.mutate(deleteConfirm.id);
        } else if (deleteConfirm.type === "transaction") {
            deleteMutation.mutate(deleteConfirm.id);
        }
        setDeleteConfirm({ ...deleteConfirm, open: false });
        toast({ variant: "success", title: "删除成功", description: "记录已删除" });
    };

    const confirmAllMutation = useMutation({
        mutationFn: () => confirmTransactions(ledgerId, { confirmAll: true }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
            setConfirmingAll(false);
            toast({ variant: "success", title: "确认成功", description: "所有交易已确认" });
        },
        onError: () => {
            setConfirmingAll(false);
            toast({ variant: "error", title: "确认失败", description: "无法确认交易，请稍后重试" });
        },
    });

    const confirmBatchMutation = useMutation({
        mutationFn: (transactionIds: string[]) => confirmTransactions(ledgerId, { transactionIds }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
            toast({ variant: "success", title: "确认成功", description: "交易批次已确认" });
        },
        onError: () => toast({ variant: "error", title: "确认失败", description: "无法确认交易，请稍后重试" })
    });

    const failedReceipts = queuedReceipts?.filter((m) => m.status === "failed" || m.status === "invalid") || [];
    const hasFailedReceipts = failedReceipts.length > 0;
    const pendingCount = pendingGroups.batches.length + pendingGroups.others.length;

    // Pinned set logic
    const pinnedReceiptIds = new Set([
        ...failedReceipts.map(r => r.id),
        ...pendingGroups.batches.map(b => b.receipt.id)
    ]);

    const handleConfirmAll = () => {
        setConfirmingAll(true);
        confirmAllMutation.mutate();
    };

    const handleRetryAll = async () => {
        setConfirmingAll(true);
        await Promise.all(failedReceipts.map((receipt) => retryReceipt(ledgerId, receipt.id)));
        queryClient.invalidateQueries({ queryKey: ["receipts", ledgerId] });
        setConfirmingAll(false);
        toast({ variant: "success", title: "重试已提交", description: "正在重试所有失败的记录" });
    };

    const pendingConfirmationItems: PinnedItem[] = [
        ...pendingGroups.batches.map(batch => ({ type: "batch", status: "pending", date: batch.receipt.createdAt, data: batch } as const)),
        ...pendingGroups.others.map(tx => ({ type: "single", status: "pending", date: tx.createdAt, data: tx } as const)),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const abnormalItems: PinnedItem[] = [
        ...failedReceipts.map(receipt => ({ type: "queue", date: receipt.createdAt, data: receipt } as const)),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const handleRetryReceipt = async (receiptId: string) => {
        await retryReceipt(ledgerId, receiptId);
        queryClient.invalidateQueries({ queryKey: ["receipts", ledgerId] });
        toast({ variant: "success", title: "重试已提交", description: "正在重试该记录" });
    };

    const handleDeleteAllErrors = () => {
        setDeleteConfirm({
            open: true,
            type: "receipt", // We'll handle bulk delete specially or iterate? 
            // Better to show a specific confirmation dialog. 
            // For now, let's use a special ID or just handle it in the confirm.
            // But the current state structure is simple. 
            // Let's create a specialized function or just use a flag.
            // Actually, let's just use the existing dialog but we need to know it's "delete all errors".
            // Let's modify the deleteConfirm state or just handle it here.
            id: "ALL_ERRORS",
            title: "删除所有异常账单",
            description: "确定要删除所有异常账单吗？此操作无法撤销。"
        });
    };

    // Modified handleDeleteConfirm to handle "ALL_ERRORS"
    const handleDeleteConfirmAction = async () => {
        if (deleteConfirm.id === "ALL_ERRORS") {
            // Delete all failed receipts
            try {
                await Promise.all(failedReceipts.map(r => deleteReceipt(ledgerId, r.id)));
                queryClient.invalidateQueries({ queryKey: ["receipts", ledgerId] });
                queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
                queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
                toast({ variant: "success", title: "删除成功", description: "所有异常账单已删除" });
            } catch (e) {
                toast({ variant: "error", title: "删除失败", description: "无法删除部分记录" });
            }
        } else {
            handleDeleteConfirm();
        }
        setDeleteConfirm({ ...deleteConfirm, open: false });
    };


    const renderPinnedItem = (item: PinnedItem) => {
        const key = item.type === "queue" ? item.data.id : item.type === "batch" ? item.data.receipt.id : item.data.id;
        let className = "";
        let onRetryProp = undefined;

        if (item.type === "queue" && (item.data.status === "failed" || item.data.status === "invalid")) {
            className = "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800";
            onRetryProp = () => handleRetryReceipt(item.data.id);
        } else {
            className = "bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800";
        }

        const content = (() => {
            if (item.type === "queue") {
                return <BatchTransactionCard
                    receipt={item.data}
                    transactions={[]}
                    categories={categories}
                    status={item.data.status as any}
                    className={className}
                    defaultExpanded={true}
                    onRetry={onRetryProp}
                    onDelete={() => setDeleteConfirm({ open: true, type: "receipt", id: item.data.id, title: "确认删除", description: "确定要删除这条记录吗？" })}
                />;
            }
            if (item.type === "batch") {
                return <BatchTransactionCard
                    receipt={item.data.receipt}
                    transactions={item.data.transactions}
                    categories={categories}
                    status="processing"
                    className={className}
                    defaultExpanded={true}
                    onConfirm={async (ids) => { await confirmBatchMutation.mutateAsync(ids); }}
                    onUpdateTransaction={(id, data) => updateMutation.mutate({ transactionId: id, data })}
                    onDeleteTransaction={(id) => setDeleteConfirm({ open: true, type: "transaction", id, title: "确认删除", description: "确定要删除这条交易吗？此操作无法撤销。" })}
                    onDelete={() => setDeleteConfirm({ open: true, type: "batch", id: item.data.receipt.id, title: "确认删除", description: "确定要删除这条记录及其关联的所有交易吗？" })}
                />;
            }
            if (item.type === "single") {
                return (
                    <div className={`p-4 rounded-xl border ${className}`}>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-muted">手动记录</span>
                            <Button variant="ghost" size="icon-sm" onClick={() => setDeleteConfirm({ open: true, type: "transaction", id: item.data.id, title: "确认删除", description: "确定要删除这条交易吗？" })}><span className="sr-only">Delete</span>🗑️</Button>
                        </div>
                        <div className="text-sm">{item.data.itemName} - {item.data.amount} {item.data.currency}</div>
                    </div>
                );
            }
            return null;
        })();

        if (!content) return null;
        return (
            <motion.div key={key} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
                {content}
            </motion.div>
        );
    };

    return (
        <div className="space-y-4">
            {/* Pending Confirmation Section (Yellow) */}
            <AnimatePresence mode="popLayout">
                {pendingConfirmationItems.length > 0 && (
                    <motion.div layout className="space-y-4 px-2 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="flex justify-between items-center py-2">
                            <button onClick={() => setIsPendingConfirmationCollapsed(!isPendingConfirmationCollapsed)} className="flex items-center gap-2 group cursor-pointer hover:opacity-80 transition-opacity">
                                <h3 className="text-sm font-medium text-warning flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-warning animate-pulse"></span>
                                    待确认账单 ({pendingConfirmationItems.length})
                                </h3>
                                <motion.div animate={{ rotate: isPendingConfirmationCollapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
                                    <ChevronDown className="w-4 h-4 text-warning" />
                                </motion.div>
                            </button>
                            <div className="flex gap-2">
                                {!isPendingConfirmationCollapsed && (<Button variant="default" onClick={handleConfirmAll} disabled={confirmAllMutation.isPending || confirmingAll} size="sm" className="h-7 text-xs bg-warning text-warning-foreground hover:bg-warning/90">{confirmAllMutation.isPending ? "确认中..." : "全部确认"}</Button>)}
                            </div>
                        </div>
                        <AnimatePresence>
                            {!isPendingConfirmationCollapsed && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 overflow-hidden">
                                    <AnimatePresence mode="popLayout">
                                        {pendingConfirmationItems.map(item => renderPinnedItem(item))}
                                    </AnimatePresence>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Splitter Line - only if we have more content below, but user said "if category is empty don't show splitter". Pinned items act as a group. */}
                        {/* User said "Too high". Let's reduce margin or remove it if not needed. */}
                        {/* Actually, visually, we just need a small separator if there is subsequent content. */}
                        {/* If we have abnormal items, we might need a separator? Or just space? */}
                        <div className="h-px bg-border/50 mt-4 mx-2" />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Abnormal Bills Section (Red) */}
            <AnimatePresence mode="popLayout">
                {abnormalItems.length > 0 && (
                    <motion.div layout className="space-y-4 px-2 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="flex justify-between items-center py-2">
                            <button onClick={() => setIsErrorCollapsed(!isErrorCollapsed)} className="flex items-center gap-2 group cursor-pointer hover:opacity-80 transition-opacity">
                                <h3 className="text-sm font-medium text-red-500 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                    异常账单 ({abnormalItems.length})
                                </h3>
                                <motion.div animate={{ rotate: isErrorCollapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
                                    <ChevronDown className="w-4 h-4 text-red-500" />
                                </motion.div>
                            </button>
                            <div className="flex gap-2">
                                {!isErrorCollapsed && (
                                    <>
                                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:bg-destructive/10" onClick={handleDeleteAllErrors}>全部删除</Button>
                                        <Button variant="destructive" size="sm" className="h-7 text-xs" disabled={confirmingAll} onClick={handleRetryAll}>全部重试</Button>
                                    </>
                                )}
                            </div>
                        </div>
                        <AnimatePresence>
                            {!isErrorCollapsed && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 overflow-hidden">
                                    <AnimatePresence mode="popLayout">
                                        {abnormalItems.map(item => renderPinnedItem(item))}
                                    </AnimatePresence>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div className="h-px bg-border/50 mt-4 mx-2" />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Receipt List (Chronological) */}
            <div className="space-y-6 px-2">
                {allReceipts.length === 0 ? (
                    <div className="text-center py-20 text-muted flex flex-col items-center gap-2">
                        <span className="text-4xl opacity-20">🧾</span>
                        <span>暂无记录</span>
                    </div>
                ) : (
                    allReceipts
                        .filter(receipt => !pinnedReceiptIds.has(receipt.id)) // Filter out pinned items to key feed clean
                        .map((receipt) => {
                            // Check if we have confirmed transactions for this receipt
                            const transactions = confirmedTransactionsMap.get(receipt.id) || [];
                            // Determine if confirmed (if in valid list or has status)
                            const isConfirmed = receipt.status === 'completed' || receipt.status === 'to_confirm';

                            return (
                                <div key={receipt.id}>
                                    <BatchTransactionCard
                                        receipt={receipt}
                                        transactions={transactions}
                                        categories={categories}
                                        status={receipt.status as any}
                                        isConfirmed={true} // For the feed, we act as if it's display-only/confirmed style (no action buttons) unless it's strictly pending
                                        // Wait, if it's pending it should have been pinned. 
                                        // If it's processing/queued but not in pinned receipt IDs?
                                        // 'pinnedReceiptIds' covers failed and pending-batches.
                                        // So here we mostly have 'completed' or 'queued/processing' that haven't failed.
                                        // If 'queued', transactions will be empty, correct.
                                        // If 'completed', transactions should be found in map.
                                        onDelete={() => setDeleteConfirm({ open: true, type: "receipt", id: receipt.id, title: "确认删除", description: "确定要删除这条记录吗？" })}
                                        onUpdateTransaction={(id, data) => updateMutation.mutate({ transactionId: id, data })} // Allow edit even in feed? User said "view detailed". Why not allow edit if needed.
                                        onDeleteTransaction={(id) => deleteMutation.mutate(id)}
                                    />
                                </div>
                            );
                        })
                )}
            </div>

            <ConfirmDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })} title={deleteConfirm.title} description={deleteConfirm.description} onConfirm={handleDeleteConfirmAction} variant="destructive" confirmLabel="删除" />
        </div>
    );
}
