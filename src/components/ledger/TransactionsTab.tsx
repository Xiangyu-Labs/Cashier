import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
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
import { TransactionDetailModal } from "@/components/TransactionDetailModal";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { useTranslations } from "next-intl";

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
    const t = useTranslations("TransactionsTab");
    const tCommon = useTranslations("Common");
    const queryClient = useQueryClient();
    const [confirmingAll, setConfirmingAll] = useState(false);
    const [isPendingConfirmationCollapsed, setIsPendingConfirmationCollapsed] = useState(defaultCollapsed);
    const [isQueuedCollapsed, setIsQueuedCollapsed] = useState(defaultCollapsed);
    // Error section defaults to expanded as well
    const [isErrorCollapsed, setIsErrorCollapsed] = useState(defaultCollapsed);

    // Date Range Filter State (Default: Current Month)
    const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>(() => {
        const now = new Date();
        return {
            start: new Date(now.getFullYear(), now.getMonth(), 1),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        };
    });

    useEffect(() => {
        setIsPendingConfirmationCollapsed(defaultCollapsed);
        setIsQueuedCollapsed(defaultCollapsed);
        setIsErrorCollapsed(defaultCollapsed);
    }, [defaultCollapsed]);

    // Fetch ALL receipts for the main list (history view) - using Infinite Query
    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
    } = useInfiniteQuery({
        queryKey: ["receipts", ledgerId, "all", dateRange.start?.toISOString(), dateRange.end?.toISOString()],
        queryFn: ({ pageParam }) => fetchReceipts(ledgerId, {
            cursor: pageParam,
            startDate: dateRange.start?.toISOString(),
            endDate: dateRange.end?.toISOString(),
        }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

    const allReceipts = (data?.pages.flatMap((page) => page.items) || [])
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
            queryClient.invalidateQueries({ queryKey: ["receipts", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (transactionId: string) => deleteTransaction(ledgerId, transactionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["receipts", ledgerId] });
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
            toast({ variant: "error", title: t("deleteFailed"), description: tCommon("error") });
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

    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    function handleDeleteConfirm() {
        if (!deleteConfirm.id || !deleteConfirm.type) return;
        if (deleteConfirm.type === "receipt" || deleteConfirm.type === "batch") {
            deleteReceiptMutation.mutate(deleteConfirm.id);
        } else if (deleteConfirm.type === "transaction") {
            deleteMutation.mutate(deleteConfirm.id);
        }
        setDeleteConfirm({ ...deleteConfirm, open: false });
        toast({ variant: "success", title: t("deleteSuccess"), description: "" });
    }

    const confirmAllMutation = useMutation({
        mutationFn: () => confirmTransactions(ledgerId, { confirmAll: true }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["receipts", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
            setConfirmingAll(false);
            toast({ variant: "success", title: t("confirmSuccess"), description: "" });
        },
        onError: () => {
            setConfirmingAll(false);
            toast({ variant: "error", title: t("confirmFailed"), description: tCommon("error") });
        },
    });

    const confirmBatchMutation = useMutation({
        mutationFn: (transactionIds: string[]) => confirmTransactions(ledgerId, { transactionIds }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["receipts", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
            toast({ variant: "success", title: t("confirmSuccess"), description: "" });
        },
        onError: () => toast({ variant: "error", title: t("confirmFailed"), description: tCommon("error") })
    });

    function isDateInRange(dateStr: string) {
        if (!dateRange.start || !dateRange.end) return true;
        const d = new Date(dateStr).getTime();
        return d >= dateRange.start.getTime() && d <= dateRange.end.getTime();
    }

    const failedReceipts = (queuedReceipts?.filter((m) => m.status === "failed" || m.status === "invalid") || [])
        .filter(r => isDateInRange(r.createdAt));
    const processingReceipts = (queuedReceipts?.filter((m) => m.status === "queued" || m.status === "processing") || [])
        .filter(r => isDateInRange(r.createdAt));

    // Pinned set logic
    const pinnedReceiptIds = new Set([
        ...failedReceipts.map(r => r.id),
        ...processingReceipts.map(r => r.id),
        ...pendingGroups.batches.filter(b => isDateInRange(b.receipt.createdAt)).map(b => b.receipt.id)
    ]);

    function handleConfirmAll() {
        setConfirmingAll(true);
        confirmAllMutation.mutate();
    }

    async function handleRetryAll() {
        setConfirmingAll(true);
        // Retry all displayed failed receipts
        await Promise.all(failedReceipts.map((receipt) => retryReceipt(ledgerId, receipt.id)));
        queryClient.invalidateQueries({ queryKey: ["receipts", ledgerId] });
        setConfirmingAll(false);
        toast({ variant: "success", title: t("retrySubmitted"), description: t("retryAllDesc") });
    }

    const pendingConfirmationItems: PinnedItem[] = [
        ...pendingGroups.batches
            .filter(batch => isDateInRange(batch.receipt.createdAt))
            .map(batch => ({ type: "batch", status: "pending", date: batch.receipt.createdAt, data: batch } as const)),
        ...pendingGroups.others
            .filter(tx => isDateInRange(tx.createdAt))
            .map(tx => ({ type: "single", status: "pending", date: tx.createdAt, data: tx } as const)),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const abnormalItems: PinnedItem[] = [
        ...failedReceipts.map(receipt => ({ type: "queue", date: receipt.createdAt, data: receipt } as const)),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const processingItems: PinnedItem[] = [
        ...processingReceipts.map(receipt => ({ type: "queue", date: receipt.createdAt, data: receipt } as const)),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    async function handleRetryReceipt(receiptId: string) {
        await retryReceipt(ledgerId, receiptId);
        queryClient.invalidateQueries({ queryKey: ["receipts", ledgerId] });
        toast({ variant: "success", title: t("retrySubmitted"), description: "" });
    }

    function handleDeleteAllErrors() {
        setDeleteConfirm({
            open: true,
            type: "receipt",
            id: "ALL_ERRORS",
            title: t("deleteAllConfirmTitle"),
            description: t("deleteAllConfirmDesc")
        });
    }

    async function handleDeleteConfirmAction() {
        if (deleteConfirm.id === "ALL_ERRORS") {
            // Delete all failed receipts
            try {
                await Promise.all(failedReceipts.map(r => deleteReceipt(ledgerId, r.id)));
                queryClient.invalidateQueries({ queryKey: ["receipts", ledgerId] });
                queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
                queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
                toast({ variant: "success", title: t("deleteSuccess"), description: "" });
            } catch (error) {
                console.error("Failed to delete abnormal bills:", error);
                toast({ variant: "error", title: t("deleteFailed"), description: "" });
            }
        } else {
            handleDeleteConfirm();
        }
        setDeleteConfirm({ ...deleteConfirm, open: false });
    }


    function renderPinnedItem(item: PinnedItem) {
        const key = item.type === "queue" ? item.data.id : item.type === "batch" ? item.data.receipt.id : item.data.id;
        let className = "";
        let onRetryProp = undefined;

        if (item.type === "queue" && (item.data.status === "failed" || item.data.status === "invalid")) {
            className = "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800";
            onRetryProp = () => handleRetryReceipt(item.data.id);
        } else if (item.type === "queue" && (item.data.status === "queued" || item.data.status === "processing")) {
            className = "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800";
        } else {
            className = "bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800";
        }

        const content = (() => {
            if (item.type === "queue") {
                return <BatchTransactionCard
                    receipt={item.data}
                    transactions={[]}
                    categories={categories}
                    status={item.data.status || 'processing'}
                    className={className}
                    defaultExpanded={true}
                    onRetry={onRetryProp}
                    onDelete={() => setDeleteConfirm({ open: true, type: "receipt", id: item.data.id, title: t("deleteConfirmTitle"), description: t("deleteConfirmDesc") })}
                />;
            }
            if (item.type === "batch") {
                return <BatchTransactionCard
                    receipt={item.data.receipt}
                    transactions={item.data.transactions}
                    categories={categories}
                    status="pending"
                    className={className}
                    defaultExpanded={true}
                    onConfirm={async (ids) => { await confirmBatchMutation.mutateAsync(ids); }}
                    onUpdateTransaction={(id, data) => updateMutation.mutate({ transactionId: id, data })}
                    onDeleteTransaction={(id) => setDeleteConfirm({ open: true, type: "transaction", id, title: t("deleteConfirmTitle"), description: t("deleteConfirmDesc") })}
                    onDelete={() => setDeleteConfirm({ open: true, type: "batch", id: item.data.receipt.id, title: t("deleteConfirmTitle"), description: t("deleteConfirmDesc") })}
                    onViewTransaction={(tx) => {
                        setSelectedTransaction(tx);
                        setIsDetailModalOpen(true);
                    }}
                />;
            }
            if (item.type === "single") {
                return (
                    <div className={`p-4 rounded-xl border ${className}`}>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-muted">{t("manualRecord")}</span>
                            <Button variant="ghost" size="icon-sm" onClick={() => setDeleteConfirm({ open: true, type: "transaction", id: item.data.id, title: t("deleteConfirmTitle"), description: t("deleteConfirmDesc") })}><span className="sr-only">Delete</span>🗑️</Button>
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
    }

    return (
        <div className="space-y-4">
            <div className="px-2 mb-2 sm:mb-4">
                <DateRangeFilter
                    startDate={dateRange.start}
                    endDate={dateRange.end}
                    onRangeChange={({ start, end }) => setDateRange({ start, end })}
                    className="w-full sm:w-auto"
                />
            </div>

            {/* Processing/Queued Section (Blue) */}
            <AnimatePresence mode="popLayout">
                {processingItems.length > 0 && (
                    <motion.div layout className="space-y-3 px-1 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="flex justify-between items-center min-h-[44px] px-3 bg-blue-50/40 dark:bg-blue-900/10 border border-blue-100/50 dark:border-blue-900/20 rounded-xl transition-all group/header hover:bg-blue-50/60 dark:hover:bg-blue-900/20">
                            <button onClick={() => setIsQueuedCollapsed(!isQueuedCollapsed)} className="flex items-center gap-2 group cursor-pointer hover:opacity-80 transition-opacity">
                                <h3 className="text-sm font-medium text-blue-500 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                    {t("processing")} ({processingItems.length})
                                </h3>
                                <motion.div animate={{ rotate: isQueuedCollapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
                                    <ChevronDown className="w-4 h-4 text-blue-500" />
                                </motion.div>
                            </button>
                        </div>
                        <AnimatePresence>
                            {!isQueuedCollapsed && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 overflow-hidden">
                                    <AnimatePresence mode="popLayout">
                                        {processingItems.map(item => renderPinnedItem(item))}
                                    </AnimatePresence>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div className="h-px bg-border/50 mt-4 mx-2" />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Pending Confirmation Section (Yellow) */}
            <AnimatePresence mode="popLayout">
                {pendingConfirmationItems.length > 0 && (
                    <motion.div layout className="space-y-3 px-1 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="flex justify-between items-center min-h-[44px] px-3 bg-yellow-50/40 dark:bg-yellow-900/10 border border-yellow-100/50 dark:border-yellow-900/20 rounded-xl transition-all group/header hover:bg-yellow-50/60 dark:hover:bg-yellow-900/20">
                            <button onClick={() => setIsPendingConfirmationCollapsed(!isPendingConfirmationCollapsed)} className="flex items-center gap-2 group cursor-pointer hover:opacity-80 transition-opacity">
                                <h3 className="text-sm font-medium text-warning flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-warning animate-pulse"></span>
                                    {t("pending")} ({pendingConfirmationItems.length})
                                </h3>
                                <motion.div animate={{ rotate: isPendingConfirmationCollapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
                                    <ChevronDown className="w-4 h-4 text-warning" />
                                </motion.div>
                            </button>
                            <div className="flex gap-2">
                                <Button variant="default" onClick={handleConfirmAll} disabled={confirmAllMutation.isPending || confirmingAll} size="sm" className="h-7 px-3 text-xs bg-warning text-warning-foreground hover:bg-warning/90 shadow-sm transition-all active:scale-95">{confirmAllMutation.isPending ? t("confirming") : t("confirmAll")}</Button>
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

                        <div className="h-px bg-border/50 mt-4 mx-2" />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Abnormal Bills Section (Red) */}
            <AnimatePresence mode="popLayout">
                {abnormalItems.length > 0 && (
                    <motion.div layout className="space-y-4 px-1 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div className="flex justify-between items-center min-h-[44px] px-3 bg-red-50/40 dark:bg-red-900/10 border border-red-100/50 dark:border-red-900/20 rounded-xl transition-all group/header hover:bg-red-50/60 dark:hover:bg-red-900/20">
                            <button onClick={() => setIsErrorCollapsed(!isErrorCollapsed)} className="flex items-center gap-2 group cursor-pointer hover:opacity-80 transition-opacity">
                                <h3 className="text-sm font-medium text-red-500 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                    {t("abnormal")} ({abnormalItems.length})
                                </h3>
                                <motion.div animate={{ rotate: isErrorCollapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
                                    <ChevronDown className="w-4 h-4 text-red-500" />
                                </motion.div>
                            </button>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" className="h-7 px-3 text-xs bg-red-50/50 text-red-600 border-red-100 hover:bg-red-50 hover:border-red-200 transition-all active:scale-95" onClick={handleDeleteAllErrors}>{t("deleteAll")}</Button>
                                <Button variant="destructive" size="sm" className="h-7 px-3 text-xs shadow-sm transition-all active:scale-95" disabled={confirmingAll} onClick={handleRetryAll}>{t("retryAll")}</Button>
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
                {isLoading ? (
                    <div className="text-center py-20 text-muted flex flex-col items-center gap-2">
                        <span className="w-6 h-6 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin"></span>
                        <span>{tCommon("loading")}</span>
                    </div>
                ) : allReceipts.length === 0 ? (
                    <div className="text-center py-20 text-muted flex flex-col items-center gap-2">
                        <span className="text-4xl opacity-20">🧾</span>
                        <span>{t("noRecords")}</span>
                    </div>
                ) : (
                    <>
                        {allReceipts
                            .filter(receipt => !pinnedReceiptIds.has(receipt.id)) // Filter out pinned items to key feed clean
                            .map((receipt) => {
                                // Check if we have confirmed transactions for this receipt
                                const transactions = confirmedTransactionsMap.get(receipt.id) || [];
                                return (
                                    <div key={receipt.id} className="mb-4 sm:mb-6">
                                        <BatchTransactionCard
                                            receipt={receipt}
                                            transactions={transactions}
                                            categories={categories}
                                            status={receipt.status || 'completed'}
                                            isConfirmed={true}
                                            onDelete={() => setDeleteConfirm({ open: true, type: "receipt", id: receipt.id, title: t("deleteConfirmTitle"), description: t("deleteConfirmDesc") })}
                                            onUpdateTransaction={(id, data) => updateMutation.mutate({ transactionId: id, data })}
                                            onDeleteTransaction={(id) => deleteMutation.mutate(id)}
                                            onViewTransaction={(tx) => {
                                                setSelectedTransaction(tx);
                                                setIsDetailModalOpen(true);
                                            }}
                                        />
                                    </div>
                                );
                            })}
                        {/* Sentinel for Infinite Scroll */}
                        <div className="h-10 flex items-center justify-center text-muted text-sm pb-4">
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
                                <span className="opacity-50 text-xs">{t("noMore")}</span>
                            )}
                        </div>
                    </>
                )}
            </div>

            <ConfirmDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })} title={deleteConfirm.title} description={deleteConfirm.description} onConfirm={handleDeleteConfirmAction} variant="destructive" confirmLabel={tCommon("delete")} />

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
