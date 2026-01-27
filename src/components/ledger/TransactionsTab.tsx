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

    const confirmAllMutation = useMutation({
        mutationFn: () => confirmTransactions(ledgerId, { confirmAll: true }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
            setConfirmingAll(false);
        },
        onError: () => setConfirmingAll(false),
    });

    const confirmBatchMutation = useMutation({
        mutationFn: (transactionIds: string[]) =>
            confirmTransactions(ledgerId, { transactionIds }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
        },
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
    };

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

            <div className="space-y-6">
                {allItems.map((item) => {
                    const key =
                        item.type === "queue"
                            ? item.data.id
                            : item.type === "batch"
                                ? item.data.inputMessage.id
                                : item.data.id;

                    if (item.type === "queue") {
                        const msg = item.data;
                        const status = msg.status as "queued" | "processing" | "failed" | "completed";

                        // Use BatchTransactionCard even for queue items to show consistent UI
                        // Passing empty transactions for now as queue items might not have them processed yet
                        return (
                            <BatchTransactionCard
                                key={key}
                                inputMessage={msg}
                                transactions={[]}
                                categories={categories}
                                status={status}
                                onDelete={() => {
                                    if (confirm("确定要删除这条记录吗？")) {
                                        deleteMessageMutation.mutate(msg.id);
                                    }
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
                                status={item.status === "confirmed" ? "completed" : "processing"} // Actually logic for 'processing' here is tricky, basically if it's in batch it's parsed.
                                // If item.status is pending, it means it's waiting for user confirmation? 
                                // No, 'batch' type in timeline comes from pendingGroups or confirmedGroups.
                                // pendingGroups means transactions are generated but not confirmed.
                                // So status is effectively 'queued' (waiting for user) or 'completed' (done/confirmed).
                                // Let's use 'processing' for pending confirmation? Or just pass undefined/calculated?
                                // Actually better mapping:
                                // Pending Confirmation -> status="queued" (waiting action) or maybe "processing"
                                // Confirmed -> status="completed"

                                // Let's map pending batch to "processing" (since it needs attention) or "queued"?
                                // "queued" in queue items means generic queue.
                                // Let's use "processing" for waiting confirmation in the UI sense (waiting user action).

                                onConfirm={async (ids) => {
                                    await confirmBatchMutation.mutateAsync(ids);
                                }}
                                onUpdateTransaction={(id, data) =>
                                    updateMutation.mutate({ transactionId: id, data })
                                }
                                onDeleteTransaction={(id) => deleteMutation.mutate(id)}
                                onDelete={() => {
                                    if (confirm("确定要删除这条记录及其关联的所有交易吗？")) {
                                        deleteMessageMutation.mutate(item.data.inputMessage.id);
                                    }
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
                                onDelete={() => deleteMutation.mutate(item.data.id)}
                            />
                        );
                    }

                    return null;
                })}

                {allItems.length === 0 && (
                    <div className="text-center py-10 text-muted">暂无记录</div>
                )}
            </div>
        </div>
    );
}
