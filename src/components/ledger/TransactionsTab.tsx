"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    confirmTransactions,
    updateTransaction,
    deleteTransaction,
    retryMessage,
    deleteMessage,
} from "@/lib/api";
import { Transaction, Category, InputMessage } from "@/types/api";
import { BatchTransactionCard } from "@/components/transaction/BatchTransactionCard";
import { TransactionCard } from "@/components/transaction/TransactionCard";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";

interface TransactionsTabProps {
    ledgerId: string;
    pendingGroups: {
        batches: { inputMessage: InputMessage; transactions: Transaction[] }[];
        others: Transaction[];
    };
    confirmedGroups: {
        batches: { inputMessage: InputMessage; transactions: Transaction[] }[];
        others: Transaction[];
    };
    queuedMessages?: InputMessage[];
    categories: Category[];
}

// Separate helper for the timeline item types
type TimelineItem =
    | { type: "queue"; date: string; data: InputMessage }
    | {
        type: "batch";
        status: "pending" | "confirmed";
        date: string;
        data: { inputMessage: InputMessage; transactions: Transaction[] };
    }
    | {
        type: "single";
        status: "pending" | "confirmed";
        date: string;
        data: Transaction;
    };



export function TransactionsTab({
    ledgerId,
    pendingGroups,
    confirmedGroups,
    queuedMessages = [],
    categories,
}: TransactionsTabProps) {
    const queryClient = useQueryClient();
    const [confirmingAll, setConfirmingAll] = useState(false);

    const updateMutation = useMutation({
        mutationFn: ({
            transactionId,
            data,
        }: {
            transactionId: string;
            data: Parameters<typeof updateTransaction>[2];
        }) => updateTransaction(ledgerId, transactionId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (transactionId: string) =>
            deleteTransaction(ledgerId, transactionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
        },
    });
    const { toast } = useToast();
    const [deleteConfirm, setDeleteConfirm] = useState<{
        open: boolean;
        type: "message" | "batch" | "transaction" | null;
        id: string | null;
        title: string;
        description: string;
    }>({
        open: false,
        type: null,
        id: null,
        title: "",
        description: "",
    });

    const handleDeleteConfirm = () => {
        if (!deleteConfirm.id || !deleteConfirm.type) return;

        if (deleteConfirm.type === "message" || deleteConfirm.type === "batch") {
            deleteMessageMutation.mutate(deleteConfirm.id);
        } else if (deleteConfirm.type === "transaction") {
            deleteMutation.mutate(deleteConfirm.id);
        }
        setDeleteConfirm({ ...deleteConfirm, open: false });
        toast({
            variant: "success",
            title: "删除成功",
            description: "记录已删除",
        });
    };

    const confirmAllMutation = useMutation({
        mutationFn: () => confirmTransactions(ledgerId, { confirmAll: true }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
            setConfirmingAll(false);
            toast({
                variant: "success",
                title: "确认成功",
                description: "所有交易已确认",
            });
        },
        onError: () => {
            setConfirmingAll(false);
            toast({
                variant: "error",
                title: "确认失败",
                description: "无法确认交易，请稍后重试",
            });
        },
    });

    const confirmBatchMutation = useMutation({
        mutationFn: (transactionIds: string[]) =>
            confirmTransactions(ledgerId, { transactionIds }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
            toast({
                variant: "success",
                title: "确认成功",
                description: "交易批次已确认",
            });
        },
        onError: () => {
            toast({
                variant: "error",
                title: "确认失败",
                description: "无法确认交易，请稍后重试",
            });
        }
    });


    const deleteMessageMutation = useMutation({
        mutationFn: async (messageId: string) => {
            return deleteMessage(ledgerId, messageId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["messages", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
        },
        onError: () => {
            toast({
                variant: "error",
                title: "删除失败",
                description: "无法删除记录，请稍后重试",
            });
        }
    });

    const pendingCount =
        pendingGroups.batches.length + pendingGroups.others.length;
    const failedMessages =
        queuedMessages?.filter((m) => m.status === "failed") || [];
    const hasFailedMessages = failedMessages.length > 0;

    // Prepare unified timeline items
    const allItems: TimelineItem[] = [
        ...queuedMessages.map(
            (msg) => ({ type: "queue", date: msg.createdAt, data: msg } as const)
        ),
        ...pendingGroups.batches.map(
            (batch) =>
            ({
                type: "batch",
                status: "pending",
                date: batch.inputMessage.createdAt,
                data: batch,
            } as const)
        ),
        ...confirmedGroups.batches.map(
            (batch) =>
            ({
                type: "batch",
                status: "confirmed",
                date: batch.inputMessage.createdAt,
                data: batch,
            } as const)
        ),
        ...pendingGroups.others.map(
            (tx) =>
            ({
                type: "single",
                status: "pending",
                date: tx.createdAt,
                data: tx,
            } as const)
        ),
        ...confirmedGroups.others.map(
            (tx) =>
            ({
                type: "single",
                status: "confirmed",
                date: tx.createdAt,
                data: tx,
            } as const)
        ),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const handleConfirmAll = async () => {
        setConfirmingAll(true);
        confirmAllMutation.mutate();
    };

    const handleRetryAll = async () => {
        setConfirmingAll(true);
        await Promise.all(
            failedMessages.map((msg) => retryMessage(ledgerId, msg.id))
        );
        queryClient.invalidateQueries({ queryKey: ["messages", ledgerId] });
        setConfirmingAll(false);
        toast({
            variant: "success",
            title: "重试已提交",
            description: "正在重试所有失败的消息",
        });
    };

    // Group items by date
    const groupedItems = allItems.reduce((groups, item) => {
        const date = new Date(item.date);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        let dateKey = "";
        if (date.toDateString() === today.toDateString()) {
            dateKey = "今天";
        } else if (date.toDateString() === yesterday.toDateString()) {
            dateKey = "昨天";
        } else {
            dateKey = date.toLocaleDateString("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "long"
            });
        }

        if (!groups[dateKey]) {
            groups[dateKey] = [];
        }
        groups[dateKey].push(item);
        return groups;
    }, {} as Record<string, TimelineItem[]>);

    return (
        <div className="space-y-4">
            {/* Header Action for Pending */}
            {(pendingCount > 0 || hasFailedMessages) && (
                <div className="flex justify-between items-center bg-surface2/30 p-3 rounded-lg border border-border mb-4">
                    <span className="text-sm font-medium text-muted">
                        {pendingCount > 0 ? `待确认 ${pendingCount} 项` : ""}
                        {pendingCount > 0 && hasFailedMessages ? "，" : ""}
                        {hasFailedMessages ? `有 ${failedMessages.length} 个失败` : ""}
                    </span>
                    <div className="flex gap-2">
                        {hasFailedMessages && (
                            <Button
                                variant="destructive"
                                size="sm"
                                disabled={confirmingAll}
                                onClick={handleRetryAll}
                            >
                                重试所有失败
                            </Button>
                        )}
                        <Button
                            variant="default"
                            onClick={handleConfirmAll}
                            disabled={
                                confirmAllMutation.isPending ||
                                confirmingAll ||
                                pendingCount === 0
                            }
                            size="sm"
                        >
                            {confirmAllMutation.isPending ? "正在确认..." : "全部确认"}
                        </Button>
                    </div>
                </div>
            )}

            <div className="space-y-8">
                {Object.entries(groupedItems).map(([dateLabel, items]) => (
                    <div key={dateLabel} className="space-y-4">
                        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-2 border-b border-border/50">
                            <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-primary/50"></span>
                                {dateLabel}
                            </h3>
                        </div>
                        <div className="space-y-6">
                            {items.map((item) => {
                                const key =
                                    item.type === "queue"
                                        ? item.data.id
                                        : item.type === "batch"
                                            ? item.data.inputMessage.id
                                            : item.data.id;

                                if (item.type === "queue") {
                                    const msg = item.data;
                                    const status = msg.status as "queued" | "processing" | "failed" | "completed";

                                    return (
                                        <BatchTransactionCard
                                            key={key}
                                            inputMessage={msg}
                                            transactions={[]}
                                            categories={categories}
                                            status={status}
                                            onDelete={() => {
                                                setDeleteConfirm({
                                                    open: true,
                                                    type: "message",
                                                    id: msg.id,
                                                    title: "确认删除",
                                                    description: "确定要删除这条记录吗？",
                                                });
                                            }}
                                        />
                                    );
                                }

                                if (item.type === "batch") {
                                    return (
                                        <BatchTransactionCard
                                            key={key}
                                            inputMessage={item.data.inputMessage}
                                            transactions={item.data.transactions}
                                            categories={categories}
                                            isConfirmed={item.status === "confirmed"}
                                            status={item.status === "confirmed" ? "completed" : "processing"}
                                            onConfirm={async (ids) => {
                                                await confirmBatchMutation.mutateAsync(ids);
                                            }}
                                            onUpdateTransaction={(id, data) =>
                                                updateMutation.mutate({ transactionId: id, data })
                                            }
                                            onDeleteTransaction={(id) => {
                                                setDeleteConfirm({
                                                    open: true,
                                                    type: "transaction",
                                                    id: id,
                                                    title: "确认删除",
                                                    description: "确定要删除这条交易吗？此操作无法撤销。",
                                                });
                                            }}
                                            onDelete={() => {
                                                setDeleteConfirm({
                                                    open: true,
                                                    type: "batch",
                                                    id: item.data.inputMessage.id,
                                                    title: "确认删除",
                                                    description: "确定要删除这条记录及其关联的所有交易吗？",
                                                });
                                            }}
                                        />
                                    );
                                }

                                if (item.type === "single") {
                                    return (
                                        <TransactionCard
                                            key={key}
                                            transaction={item.data}
                                            categories={categories}
                                            onUpdate={(data) =>
                                                updateMutation.mutate({
                                                    transactionId: item.data.id,
                                                    data,
                                                })
                                            }
                                            onDelete={() => {
                                                setDeleteConfirm({
                                                    open: true,
                                                    type: "transaction",
                                                    id: item.data.id,
                                                    title: "确认删除",
                                                    description: "确定要删除这条交易吗？此操作无法撤销。",
                                                });
                                            }}
                                        />
                                    );
                                }

                                return null;
                            })}
                        </div>
                    </div>
                ))}

                {allItems.length === 0 && (
                    <div className="text-center py-10 text-muted">暂无记录</div>
                )}
            </div>

            <ConfirmDialog
                open={deleteConfirm.open}
                onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
                title={deleteConfirm.title}
                description={deleteConfirm.description}
                onConfirm={handleDeleteConfirm}
                variant="destructive"
                confirmLabel="删除"
            />
        </div>
    );
}
