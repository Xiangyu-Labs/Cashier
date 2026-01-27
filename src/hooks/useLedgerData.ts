import { useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    fetchLedger,
    fetchTransactions,
    fetchTransactionSummary,
    fetchCategories,
    fetchReceipts,
} from "@/lib/api";
import { Receipt, Transaction } from "@/types/api";

type TransactionBatch = {
    receipt: Receipt;
    transactions: Transaction[];
};

type GroupedTransactions = {
    batches: TransactionBatch[];
    others: Transaction[];
};

function groupTransactions(transactions?: Transaction[]): GroupedTransactions {
    if (!transactions) return { batches: [], others: [] };

    const batches: Record<string, TransactionBatch> = {};
    const others: Transaction[] = [];

    for (const tx of transactions) {
        if (tx.receipt && tx.receiptId) {
            if (!batches[tx.receiptId]) {
                batches[tx.receiptId] = {
                    receipt: tx.receipt,
                    transactions: [],
                };
            }
            batches[tx.receiptId].transactions.push(tx);
        } else {
            others.push(tx);
        }
    }

    const sortedBatches = Object.values(batches).sort((a, b) =>
        new Date(b.receipt.createdAt).getTime() - new Date(a.receipt.createdAt).getTime()
    );

    return {
        batches: sortedBatches,
        others,
    };
}

export function useLedgerData(ledgerId: string) {
    const queryClient = useQueryClient();

    // Poll for queued/processing receipts first to determine if we need to poll others
    const { data: queuedReceipts } = useQuery({
        queryKey: ["receipts", ledgerId, "queued"],
        queryFn: () => fetchReceipts(ledgerId, ["queued", "processing", "failed", "invalid"]),
        refetchInterval: (query) => {
            const data = query.state.data;
            return data && data.length > 0 ? 1000 : 5000;
        },
    });

    const isProcessing = queuedReceipts?.some(m => m.status === 'queued' || m.status === 'processing');
    const refetchInterval = isProcessing ? 1000 : false;

    // Track previous queue length to detect completion
    const prevQueueLengthRef = useRef(queuedReceipts?.length || 0);

    useEffect(() => {
        const currentLength = queuedReceipts?.length || 0;
        // If queue size decreased, something finished processing (or was deleted)
        // In either case, we should refresh transactions to show the result
        if (currentLength < prevQueueLengthRef.current) {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
        }
        prevQueueLengthRef.current = currentLength;
    }, [queuedReceipts?.length, queryClient, ledgerId]);

    const { data: ledger, isLoading: isLedgerLoading } = useQuery({
        queryKey: ["ledger", ledgerId],
        queryFn: () => fetchLedger(ledgerId),
    });

    const { data: categories } = useQuery({
        queryKey: ["categories", ledgerId],
        queryFn: () => fetchCategories(ledgerId),
    });

    const { data: pendingTxs } = useQuery({
        queryKey: ["transactions", ledgerId, "pending"],
        queryFn: () => fetchTransactions(ledgerId, { status: "pending" }),
        refetchInterval,
    });

    const { data: confirmedTxs } = useQuery({
        queryKey: ["transactions", ledgerId, "confirmed"],
        queryFn: () => fetchTransactions(ledgerId, { status: "confirmed", limit: 100 }),
        refetchInterval,
    });

    const { data: summary } = useQuery({
        queryKey: ["summary", ledgerId],
        queryFn: () => fetchTransactionSummary(ledgerId, "confirmed"),
        refetchInterval,
    });

    const pendingGroups = useMemo(() => groupTransactions(pendingTxs), [pendingTxs]);
    const confirmedGroups = useMemo(() => groupTransactions(confirmedTxs), [confirmedTxs]);

    const processingReceipts = queuedReceipts?.filter((m) => m.status === "processing") || [];
    const queuedOnlyReceipts = queuedReceipts?.filter((m) => m.status === "queued") || [];
    const failedReceipts = queuedReceipts?.filter((m) => m.status === "failed" || m.status === "invalid") || [];

    return {
        ledger,
        isLedgerLoading,
        categories: categories || [],
        confirmedTxs,
        summary,
        queuedReceipts: queuedReceipts || [],
        pendingGroups,
        confirmedGroups,
        stats: {
            processingCount: processingReceipts.length,
            queuedCount: queuedOnlyReceipts.length,
            failedCount: failedReceipts.length,
        },
    };
}
