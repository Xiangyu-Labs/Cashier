"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    confirmTransactions,
    updateTransaction,
    deleteTransaction,
    retryMessage,
} from "@/lib/api";
import { Transaction, Category, InputMessage } from "@/types/api";
import { BatchTransactionCard } from "@/components/transaction/BatchTransactionCard";
import { TransactionCard } from "@/components/transaction/TransactionCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

function getMessageStatusText(status?: string) {
    switch (status) {
        case "processing":
            return "正在处理...";
        case "queued":
            return "排队中...";
        case "failed":
            return "处理失败";
        default:
            return status || "未知状态";
    }
}

function getMessageContentSummary(msg: InputMessage): string {
    if (msg.contentType === "image") return "[图片]";

    if (msg.contentType === "text") {
        if (msg.content.startsWith("{")) {
            try {
                const parsed = JSON.parse(msg.content);
                return (
                    parsed.text || (parsed.images?.length ? "[图片]" : "[内容]")
                );
            } catch {
                return msg.content;
            }
        }
        return msg.content;
    }

    return "[消息]";
}

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

    const retryMessageMutation = useMutation({
        mutationFn: async (message: InputMessage) => {
            return retryMessage(ledgerId, message.id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["messages", ledgerId] });
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
                        const isProcessing =
                            msg.status === "processing" || msg.status === "queued";
                        return (
                            <Card
                                key={key}
                                className="border-dashed border-primary/30 bg-surface2/20"
                            >
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        {isProcessing ? (
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary shrink-0"></div>
                                        ) : (
                                            <div className="h-4 w-4 rounded-full bg-danger/20 text-danger flex items-center justify-center shrink-0">
                                                !
                                            </div>
                                        )}
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">
                                                    {getMessageStatusText(msg.status)}
                                                </span>
                                                <span className="text-xs text-muted">
                                                    {new Date(msg.createdAt).toLocaleTimeString()}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted truncate">
                                                {getMessageContentSummary(msg)}
                                            </p>
                                            {msg.error && (
                                                <p className="text-xs text-danger mt-1">
                                                    {msg.error}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {msg.status === "failed" && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => retryMessageMutation.mutate(msg)}
                                            disabled={retryMessageMutation.isPending}
                                        >
                                            重试
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
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
                                onConfirm={async (ids) => {
                                    await confirmBatchMutation.mutateAsync(ids);
                                }}
                                onUpdateTransaction={(id, data) =>
                                    updateMutation.mutate({ transactionId: id, data })
                                }
                                onDeleteTransaction={(id) => deleteMutation.mutate(id)}
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
