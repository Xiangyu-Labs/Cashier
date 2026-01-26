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
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecordTab } from "@/components/ledger/RecordTab";
import { VerifyTab } from "@/components/ledger/VerifyTab";
import { HistoryTab } from "@/components/ledger/HistoryTab";
import { StatsTab } from "@/components/ledger/StatsTab";
import { Badge } from "@/components/ui/badge";

export default function LedgerPage() {
  const params = useParams();
  const ledgerId = params.id as string;
  const [activeTab, setActiveTab] = useState("record");

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
    queryFn: () => fetchInputMessages(ledgerId, ["queued", "processing"]),
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
            <h1 className="text-lg font-bold truncate max-w-[200px]">{ledger.name}</h1>
          </div>
          <Link href={`/ledger/${ledgerId}/categories`}>
            <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 text-xs">
              设置分类
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="record">记账</TabsTrigger>
            <TabsTrigger value="verify" className="relative">
              核对
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-danger" />
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">明细</TabsTrigger>
            <TabsTrigger value="stats">统计</TabsTrigger>
          </TabsList>

          <TabsContent value="record" className="mt-0">
            <RecordTab ledgerId={ledgerId} queuedMessages={queuedMessages} />
          </TabsContent>

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
    </div>
  );
}
