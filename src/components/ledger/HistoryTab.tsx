"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTransaction, deleteTransaction } from "@/lib/api";
import { Transaction, Category, InputMessage } from "@/types/api";
import { BatchTransactionCard } from "@/components/transaction/BatchTransactionCard";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Card, CardContent } from "@/components/ui/card";
import { TransactionDetailModal } from "@/components/TransactionDetailModal";
import { useState } from "react";

interface HistoryTabProps {
    ledgerId: string;
    confirmedGroups: {
        batches: { inputMessage: InputMessage; transactions: Transaction[] }[];
        others: Transaction[];
    };
    categories: Category[];
}

export function HistoryTab({ ledgerId, confirmedGroups, categories }: HistoryTabProps) {
    const queryClient = useQueryClient();
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

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

    const hasHistory = confirmedGroups.batches.length > 0 || confirmedGroups.others.length > 0;

    if (!hasHistory) {
        return (
            <div className="py-16 text-center text-muted">
                暂无已确认记录
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {confirmedGroups.batches.map((batch) => (
                <BatchTransactionCard
                    key={batch.inputMessage.id}
                    inputMessage={batch.inputMessage}
                    transactions={batch.transactions}
                    categories={categories}
                    isConfirmed={true}
                    onUpdateTransaction={(id, data) =>
                        updateMutation.mutate({ transactionId: id, data })
                    }
                    onDeleteTransaction={(id) => deleteMutation.mutate(id)}
                />
            ))}

            {confirmedGroups.others.length > 0 && (
                <Card>
                    <div className="bg-surface2 p-3 border-b border-border">
                        <h3 className="font-medium text-text">其他历史记录</h3>
                    </div>
                    <CardContent className="p-4 space-y-2">
                        {confirmedGroups.others.map((tx) => (
                            <div
                                key={tx.id}
                                onClick={() => {
                                    setSelectedTransaction(tx);
                                    setIsDetailModalOpen(true);
                                }}
                                className="flex items-center justify-between py-2 border-b border-border last:border-0 cursor-pointer hover:bg-surface2 rounded px-2 -mx-2 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="text-xl w-8 h-8 flex items-center justify-center bg-surface2 rounded-full">
                                        <CategoryIcon iconName={tx.category?.icon} className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-text">{tx.itemName}</p>
                                        <p className="text-xs text-muted">
                                            {tx.category?.name || "未分类"}
                                            {tx.transactionDate && (
                                                <span className="ml-2">
                                                    · {new Date(tx.transactionDate).toLocaleDateString("zh-CN")}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <p className={`font-semibold ${tx.amount.startsWith("-") ? 'text-text' : 'text-danger'}`}>
                                    {tx.currency || ""} {parseFloat(tx.amount).toFixed(2)}
                                </p>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

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
