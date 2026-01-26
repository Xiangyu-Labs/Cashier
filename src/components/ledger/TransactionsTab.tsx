"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { confirmTransactions, updateTransaction, deleteTransaction, sendMessage, retryMessage } from "@/lib/api";
import { Transaction, Category, InputMessage } from "@/types/api";
import { BatchTransactionCard } from "@/components/transaction/BatchTransactionCard";
import { TransactionCard } from "@/components/transaction/TransactionCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TransactionQueueStatus } from "@/components/ledger/TransactionQueueStatus";

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

export function TransactionsTab({ ledgerId, pendingGroups, confirmedGroups, queuedMessages, categories }: TransactionsTabProps) {
    const queryClient = useQueryClient();
    const [confirmingAll, setConfirmingAll] = useState(false);

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
        }
    });


    const pendingCount = pendingGroups.batches.length + pendingGroups.others.length;

    // Combine lists? Or keep sections?
    // User wants "Merge details and check two tabs".
    // Usually a timeline view is best.

    // Let's mix them. Sort by date?
    // Messages have createdAt. Transactions have transactionDate or createdAt.
    // Batches are grouped by InputMessage. We can sort batches by InputMessage.createdAt.
    // "Others" (single transactions) have createdAt.

    // Let's create a unified list of "Items" to render.
    // Item can be: QueueStatus (Processing/Failed), Batch (Pending/Confirmed), SingleTransaction (Pending/Confirmed).

    // 1. Queued/Failed Messages
    const queueItems = (queuedMessages || []).map(msg => ({
        type: 'queue' as const,
        date: msg.createdAt,
        data: msg
    }));

    // 2. Batches (Pending)
    const pendingBatchItems = pendingGroups.batches.map(batch => ({
        type: 'batch',
        status: 'pending',
        date: batch.inputMessage.createdAt,
        data: batch
    }));

    // 3. Batches (Confirmed)
    const confirmedBatchItems = confirmedGroups.batches.map(batch => ({
        type: 'batch',
        status: 'confirmed',
        date: batch.inputMessage.createdAt,
        data: batch
    }));

    // 4. Singles (Pending) -> Wrapped in a card? Or individual?
    // Let's group "others" by day maybe? Or just list them.
    // Simplest: Treat each "Other" transaction as an item.
    const pendingSingleItems = pendingGroups.others.map(tx => ({
        type: 'single' as const,
        status: 'pending' as const,
        date: tx.createdAt,
        data: tx
    }));

    const confirmedSingleItems = confirmedGroups.others.map(tx => ({
        type: 'single' as const,
        status: 'confirmed' as const,
        date: tx.createdAt,
        data: tx
    }));

    type TimelineItem =
        | { type: 'queue'; date: string; data: InputMessage }
        | { type: 'batch'; status: 'pending' | 'confirmed'; date: string; data: { inputMessage: InputMessage; transactions: Transaction[] } }
        | { type: 'single'; status: 'pending' | 'confirmed'; date: string; data: Transaction };

    // Merge and Sort
    const allItems: TimelineItem[] = [
        ...queueItems,
        ...pendingBatchItems.map(i => ({ ...i, type: 'batch' as const, status: 'pending' as const })),
        ...confirmedBatchItems.map(i => ({ ...i, type: 'batch' as const, status: 'confirmed' as const })),
        ...pendingSingleItems,
        ...confirmedSingleItems
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());


    return (
        <div className="space-y-4">
            {/* Header Action for Pending */}
            {(pendingCount > 0 || (queuedMessages && queuedMessages.some(m => m.status === 'failed'))) && (
                <div className="flex justify-between items-center bg-surface2/30 p-3 rounded-lg border border-border mb-4">
                    <span className="text-sm font-medium text-muted">
                        {pendingCount > 0 ? `待确认 ${pendingCount} 项` : ""}
                        {pendingCount > 0 && queuedMessages?.some(m => m.status === 'failed') ? "，" : ""}
                        {queuedMessages?.some(m => m.status === 'failed') ? `有 ${queuedMessages.filter(m => m.status === 'failed').length} 个失败` : ""}
                    </span>
                    <div className="flex gap-2">
                        {queuedMessages && queuedMessages.some(m => m.status === 'failed') && (
                            <Button
                                variant="destructive"
                                size="sm"
                                disabled={confirmingAll}
                                onClick={async () => {
                                    setConfirmingAll(true);
                                    const failed = queuedMessages.filter(m => m.status === 'failed');
                                    await Promise.all(failed.map(msg => retryMessage(ledgerId, msg.id)));
                                    queryClient.invalidateQueries({ queryKey: ["messages", ledgerId] });
                                    setConfirmingAll(false);
                                }}
                            >
                                重试所有失败
                            </Button>
                        )}
                        <Button
                            variant="default"
                            onClick={() => {
                                setConfirmingAll(true);
                                confirmAllMutation.mutate();
                            }}
                            disabled={confirmAllMutation.isPending || confirmingAll || pendingCount === 0}
                            size="sm"
                        >
                            {confirmAllMutation.isPending ? "正在确认..." : "全部确认"}
                        </Button>
                    </div>
                </div>
            )}

            <div className="space-y-6">
                {allItems.map((item, index) => {
                    const key = item.type === 'queue' ? (item.data as InputMessage).id
                        : item.type === 'batch' ? (item.data as any).inputMessage.id
                            : (item.data as Transaction).id;

                    if (item.type === 'queue') {
                        const msg = item.data as InputMessage;
                        return (
                            <Card key={key} className="border-dashed border-primary/30 bg-surface2/20">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        {msg.status === 'processing' || msg.status === 'queued' ? (
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary shrink-0"></div>
                                        ) : (
                                            <div className="h-4 w-4 rounded-full bg-danger/20 text-danger flex items-center justify-center shrink-0">!</div>
                                        )}
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">
                                                    {msg.status === 'processing' ? '正在处理...' : msg.status === 'queued' ? '排队中...' : '处理失败'}
                                                </span>
                                                <span className="text-xs text-muted">
                                                    {new Date(msg.createdAt).toLocaleTimeString()}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted truncate">
                                                {(() => {
                                                    if (msg.contentType === "image") return "[图片]";
                                                    if (msg.contentType === "text") {
                                                        if (msg.content.startsWith("{")) {
                                                            try {
                                                                const parsed = JSON.parse(msg.content);
                                                                return parsed.text || (parsed.images?.length ? "[图片]" : "[内容]");
                                                            } catch {
                                                                return msg.content;
                                                            }
                                                        }
                                                        return msg.content;
                                                    }
                                                    return "[消息]";
                                                })()}
                                            </p>
                                            {msg.error && (
                                                <p className="text-xs text-danger mt-1">{msg.error}</p>
                                            )}
                                        </div>
                                    </div>
                                    {msg.status === 'failed' && (
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

                    if (item.type === 'batch') {
                        const batch = item.data as { inputMessage: InputMessage; transactions: Transaction[] };
                        // We need to differentiate status visually? BatchTransactionCard handles "isConfirmed" prop.
                        return (
                            <BatchTransactionCard
                                key={key}
                                inputMessage={batch.inputMessage}
                                transactions={batch.transactions}
                                categories={categories}
                                isConfirmed={item.status === 'confirmed'}
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

                    if (item.type === 'single') {
                        const tx = item.data as Transaction;
                        return (
                            <TransactionCard
                                key={key}
                                transaction={tx}
                                categories={categories}
                                onUpdate={(data) =>
                                    updateMutation.mutate({ transactionId: tx.id, data })
                                }
                                onDelete={() => deleteMutation.mutate(tx.id)}
                            />
                        );
                    }

                    return null;
                })}

                {allItems.length === 0 && (
                    <div className="text-center py-10 text-muted">
                        暂无记录
                    </div>
                )}
            </div>
        </div>
    );
}
