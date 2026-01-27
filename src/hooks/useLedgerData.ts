import { useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    fetchLedger,
    fetchTransactions,
    fetchTransactionSummary,
    fetchCategories,
    fetchInputMessages,
} from "@/lib/api";
import { InputMessage, Transaction } from "@/types/api";

type TransactionBatch = {
    inputMessage: InputMessage;
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
        if (tx.inputMessage && tx.inputMessageId) {
            if (!batches[tx.inputMessageId]) {
                batches[tx.inputMessageId] = {
                    inputMessage: tx.inputMessage,
                    transactions: [],
                };
            }
            batches[tx.inputMessageId].transactions.push(tx);
        } else {
            others.push(tx);
        }
    }

    const sortedBatches = Object.values(batches).sort((a, b) =>
        new Date(b.inputMessage.createdAt).getTime() - new Date(a.inputMessage.createdAt).getTime()
    );

    return {
        batches: sortedBatches,
        others,
    };
}

export function useLedgerData(ledgerId: string) {
    const queryClient = useQueryClient();

    // Poll for queued/processing messages first to determine if we need to poll others
    const { data: queuedMessages } = useQuery({
        queryKey: ["messages", ledgerId, "queued"],
        queryFn: () => fetchInputMessages(ledgerId, ["queued", "processing", "failed"]),
        refetchInterval: (query) => {
            const data = query.state.data;
            return data && data.length > 0 ? 1000 : 5000;
        },
    });

    const isProcessing = queuedMessages?.some(m => m.status === 'queued' || m.status === 'processing');
    const refetchInterval = isProcessing ? 1000 : false;

    // Track previous queue length to detect completion
    const prevQueueLengthRef = useRef(queuedMessages?.length || 0);

    useEffect(() => {
        const currentLength = queuedMessages?.length || 0;
        // If queue size decreased, something finished processing (or was deleted)
        // In either case, we should refresh transactions to show the result
        if (currentLength < prevQueueLengthRef.current) {
            queryClient.invalidateQueries({ queryKey: ["transactions", ledgerId] });
            queryClient.invalidateQueries({ queryKey: ["summary", ledgerId] });
        }
        prevQueueLengthRef.current = currentLength;
    }, [queuedMessages?.length, queryClient, ledgerId]);

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

    const processingMessages = queuedMessages?.filter((m) => m.status === "processing") || [];
    const queuedOnlyMessages = queuedMessages?.filter((m) => m.status === "queued") || [];
    const failedMessages = queuedMessages?.filter((m) => m.status === "failed") || [];

    return {
        ledger,
        isLedgerLoading,
        categories: categories || [],
        confirmedTxs,
        summary,
        queuedMessages: queuedMessages || [],
        pendingGroups,
        confirmedGroups,
        stats: {
            processingCount: processingMessages.length,
            queuedCount: queuedOnlyMessages.length,
            failedCount: failedMessages.length,
        },
    };
}
