"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  fetchLedger,
  fetchTransactions,
  fetchTransactionSummary,
  fetchCategories,
  fetchInputMessages,
} from "@/lib/api";
import { InputMessage, Transaction } from "@/types/api";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Settings } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { TransactionsTab } from "@/components/ledger/TransactionsTab";
import { StatsTab } from "@/components/ledger/StatsTab";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TransactionInput } from "@/components/ledger/TransactionInput";
import { TransactionQueueStatus } from "@/components/ledger/TransactionQueueStatus";

export default function LedgerPage() {
  const params = useParams();
  const ledgerId = params.id as string;
  const [activeTab, setActiveTab] = useState("history");
  const [isInputOpen, setIsInputOpen] = useState(false);

  const { data: ledger, isLoading: ledgerLoading } = useQuery({
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
  });

  const { data: confirmedTxs } = useQuery({
    queryKey: ["transactions", ledgerId, "confirmed"],
    queryFn: () => fetchTransactions(ledgerId, { status: "confirmed", limit: 100 }),
  });

  const { data: summary } = useQuery({
    queryKey: ["summary", ledgerId],
    queryFn: () => fetchTransactionSummary(ledgerId, "confirmed"),
  });

  // Poll for queued/processing messages
  const { data: queuedMessages } = useQuery({
    queryKey: ["messages", ledgerId, "queued"],
    queryFn: () => fetchInputMessages(ledgerId, ["queued", "processing", "failed"]),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && data.length > 0 ? 1000 : 5000;
    },
  });

  // Group pending transactions
  const pendingGroups = useMemo(() => {
    if (!pendingTxs) return { batches: [], others: [] };

    const batches: Record<string, { inputMessage: InputMessage; transactions: Transaction[] }> = {};
    const others: Transaction[] = [];

    pendingTxs.forEach((tx) => {
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
    });

    return {
      batches: Object.values(batches).sort((a, b) =>
        new Date(b.inputMessage.createdAt).getTime() - new Date(a.inputMessage.createdAt).getTime()
      ),
      others,
    };
  }, [pendingTxs]);

  // Group confirmed transactions
  const confirmedGroups = useMemo(() => {
    if (!confirmedTxs) return { batches: [], others: [] };

    const batches: Record<string, { inputMessage: InputMessage; transactions: Transaction[] }> = {};
    const others: Transaction[] = [];

    confirmedTxs.forEach((tx) => {
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
    });

    return {
      batches: Object.values(batches).sort((a, b) =>
        new Date(b.inputMessage.createdAt).getTime() - new Date(a.inputMessage.createdAt).getTime()
      ),
      others,
    };
  }, [confirmedTxs]);

  const pendingCount = (pendingGroups.batches.length + pendingGroups.others.length) || 0;

  const processingMessages = queuedMessages?.filter(m => m.status === 'processing') || [];
  const queuedOnlyMessages = queuedMessages?.filter(m => m.status === 'queued') || [];
  const failedMessages = queuedMessages?.filter(m => m.status === 'failed') || [];

  const processingCount = processingMessages.length;
  const queuedCount = queuedOnlyMessages.length;
  const failedCount = failedMessages.length;

  if (ledgerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!ledger) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-muted">账本不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Top Navigation */}
      <header className="bg-surface border-b border-border sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 h-14 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/ledgers">
              <Button variant="ghost" size="icon" className="-ml-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex flex-col">
              <h1 className="text-lg font-bold truncate max-w-[150px]">{ledger.name}</h1>
              {(queuedCount > 0 || processingCount > 0 || failedCount > 0) && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="text-xs flex items-center gap-2 hover:opacity-80 transition-opacity">
                      {processingCount > 0 && (
                        <span className="flex items-center gap-1 text-primary">
                          <span className="animate-spin rounded-full h-2 w-2 border-b border-primary"></span>
                          {processingCount} 处理中
                        </span>
                      )}
                      {queuedCount > 0 && (
                        <span className="text-muted">
                          {queuedCount} 排队
                        </span>
                      )}
                      {failedCount > 0 && (
                        <span className="flex items-center gap-1 text-danger font-medium">
                          <span className="h-2 w-2 rounded-full bg-danger"></span>
                          {failedCount} 失败
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
                    <div className="p-3 border-b border-border bg-surface2/50 flex justify-between items-center">
                      <h4 className="font-medium text-sm">任务队列</h4>
                      <span className="text-xs text-muted">
                        共 {queuedMessages?.length} 个任务
                      </span>
                    </div>
                    <div className="p-2">
                      <TransactionQueueStatus queuedMessages={queuedMessages || []} />
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/ledger/${ledgerId}/settings`}>
              <Button variant="ghost" size="icon" className="text-muted hover:text-text" title="设置">
                <Settings className="h-5 w-5" />
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={() => setIsInputOpen(true)}
              className="rounded-full h-8 w-8 p-0"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="history">账单</TabsTrigger>
            <TabsTrigger value="stats">统计</TabsTrigger>
            {/* Kept grid-cols-4 for spacing but removed one item, might need adjustment if grid looks off, assuming user wants to keep layout or we should adjust cols */}
          </TabsList>



          <TabsContent value="history" className="mt-0">
            <TransactionsTab
              ledgerId={ledgerId}
              pendingGroups={pendingGroups}
              confirmedGroups={confirmedGroups}
              queuedMessages={queuedMessages || []}
              categories={categories || []}
            />
          </TabsContent>

          <TabsContent value="stats" className="mt-0">
            <StatsTab summary={summary} />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={isInputOpen} onOpenChange={setIsInputOpen}>
        <DialogContent className="sm:max-w-md top-[20%] translate-y-0">
          <DialogHeader>
            <DialogTitle>记一笔</DialogTitle>
          </DialogHeader>
          <TransactionInput
            ledgerId={ledgerId}
            onSuccess={() => setIsInputOpen(false)} // Optional: close on success?
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
