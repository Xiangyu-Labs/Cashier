"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { confirmTransactions, updateTransaction, deleteTransaction } from "@/lib/api";
import { Transaction, Category, InputMessage } from "@/types/api";
import { BatchTransactionCard } from "@/components/transaction/BatchTransactionCard";
import { TransactionCard } from "@/components/transaction/TransactionCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface VerifyTabProps {
    ledgerId: string;
    pendingGroups: {
        batches: { inputMessage: InputMessage; transactions: Transaction[] }[];
        others: Transaction[];
    };
    categories: Category[];
}

export function VerifyTab({ ledgerId, pendingGroups, categories }: VerifyTabProps) {
    const queryClient = useQueryClient();

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
        },
    });

    const confirmBatchMutation = useMutation({
        mutationFn: (transactionIds: string[]) =>
            confirmTransactions(ledgerId, { transactionIds }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
        },
    });

    const hasPending = pendingGroups.batches.length > 0 || pendingGroups.others.length > 0;

    if (!hasPending) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                <div className="w-16 h-16 bg-surface2 rounded-full flex items-center justify-center text-3xl">
                    🎉
                </div>
                <div>
                    <h3 className="text-lg font-medium text-text">全部已确认</h3>
                    <p className="text-muted text-sm">暂无待确认的记录</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-surface2/30 p-3 rounded-lg border border-border">
                <span className="text-sm font-medium text-muted">
                    待确认 {pendingGroups.batches.length + pendingGroups.others.length} 项
                </span>
                <Button
                    variant="default"
                    onClick={() => confirmAllMutation.mutate()}
                    disabled={confirmAllMutation.isPending}
                    size="sm"
                >
                    {confirmAllMutation.isPending ? "确认中..." : "全部确认"}
                </Button>
            </div>

            <div className="space-y-4">
                {pendingGroups.batches.map((batch) => (
                    <BatchTransactionCard
                        key={batch.inputMessage.id}
                        inputMessage={batch.inputMessage}
                        transactions={batch.transactions}
                        categories={categories}
                        onConfirm={async (ids) => {
                            await confirmBatchMutation.mutateAsync(ids);
                        }}
                        onUpdateTransaction={(id, data) =>
                            updateMutation.mutate({ transactionId: id, data })
                        }
                        onDeleteTransaction={(id) => deleteMutation.mutate(id)}
                    />
                ))}

                {pendingGroups.others.length > 0 && (
                    <Card>
                        <div className="bg-surface2 p-3 border-b border-border">
                            <h3 className="font-medium text-text">其他记录</h3>
                        </div>
                        <CardContent className="p-4 space-y-3">
                            {pendingGroups.others.map((tx) => (
                                <TransactionCard
                                    key={tx.id}
                                    transaction={tx}
                                    categories={categories}
                                    onUpdate={(data) =>
                                        updateMutation.mutate({ transactionId: tx.id, data })
                                    }
                                    onDelete={() => deleteMutation.mutate(tx.id)}
                                />
                            ))}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
