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

import { VerifyTab } from "@/components/ledger/VerifyTab";
import { HistoryTab } from "@/components/ledger/HistoryTab";
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
  const processingCount = queuedMessages?.length || 0;

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
              {processingCount > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="text-xs text-primary flex items-center gap-1 hover:underline">
                      <span className="animate-spin rounded-full h-2 w-2 border-b border-primary"></span>
                      {processingCount} 个任务处理中...
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
                    <div className="p-3 border-b border-border bg-surface2/50">
                      <h4 className="font-medium text-sm">正在处理的任务</h4>
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="history">明细</TabsTrigger>
            <TabsTrigger value="verify" className="relative">
              核对
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-danger" />
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="stats">统计</TabsTrigger>
            {/* Kept grid-cols-4 for spacing but removed one item, might need adjustment if grid looks off, assuming user wants to keep layout or we should adjust cols */}
          </TabsList>



          <TabsContent value="verify" className="mt-0">
            <VerifyTab
              ledgerId={ledgerId}
              pendingGroups={pendingGroups}
              categories={categories || []}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <HistoryTab
              ledgerId={ledgerId}
              confirmedGroups={confirmedGroups}
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
