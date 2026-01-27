"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Plus, Settings } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TransactionsTab } from "@/components/ledger/TransactionsTab";
import { StatsTab } from "@/components/ledger/StatsTab";
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
import { useLedgerData } from "@/hooks/useLedgerData";

import { LedgerSwitcher } from "@/components/ledger/LedgerSwitcher";

export default function LedgerPage() {
  const params = useParams();
  const ledgerId = params.id as string;
  const [activeTab, setActiveTab] = useState("history");
  const [isInputOpen, setIsInputOpen] = useState(false);

  const {
    ledger,
    isLedgerLoading,
    categories,
    pendingGroups,
    queuedMessages,
    stats,
  } = useLedgerData(ledgerId);

  if (isLedgerLoading) {
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


  const showTasksIndicator =
    stats.queuedCount > 0 || stats.processingCount > 0 || stats.failedCount > 0;

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Top Navigation */}
      <header className="bg-surface border-b border-border sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 h-14 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <LedgerSwitcher currentLedgerId={ledgerId} />
            {showTasksIndicator && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-xs flex items-center gap-2 hover:opacity-80 transition-opacity">
                    {stats.processingCount > 0 && (
                      <span className="flex items-center gap-1 text-primary">
                        <span className="animate-spin rounded-full h-2 w-2 border-b border-primary"></span>
                        {stats.processingCount} 处理中
                      </span>
                    )}
                    {stats.queuedCount > 0 && (
                      <span className="text-muted">
                        {stats.queuedCount} 排队
                      </span>
                    )}
                    {stats.failedCount > 0 && (
                      <span className="flex items-center gap-1 text-danger font-medium">
                        <span className="h-2 w-2 rounded-full bg-danger"></span>
                        {stats.failedCount} 失败
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="p-3 border-b border-border bg-surface2/50 flex justify-between items-center">
                    <h4 className="font-medium text-sm">任务队列</h4>
                    <span className="text-xs text-muted">
                      共 {queuedMessages.length} 个任务
                    </span>
                  </div>
                  <div className="p-2">
                    <TransactionQueueStatus
                      queuedMessages={queuedMessages}
                    />
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/ledger/${ledgerId}/settings`}>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted hover:text-text"
                title="设置"
              >
                <Settings className="h-5 w-5" />
              </Button>
            </Link>
            <ThemeToggle />
            <Button
              size="sm"
              onClick={() => setIsInputOpen(true)}
              className="rounded-full h-8 w-8 p-0"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header >

      <main className="max-w-md mx-auto p-4">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full space-y-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="history">账单</TabsTrigger>
            <TabsTrigger value="stats">统计</TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="mt-0">
            <TransactionsTab
              ledgerId={ledgerId}
              pendingGroups={pendingGroups}
              queuedMessages={queuedMessages}
              categories={categories}
            />
          </TabsContent>

          <TabsContent value="stats" className="mt-0">
            <StatsTab ledgerId={ledgerId} />
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
            onSuccess={() => setIsInputOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div >
  );
}
