"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Plus, Settings } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TransactionsTab } from "@/components/ledger/TransactionsTab";
import { DetailsTab } from "@/components/ledger/DetailsTab";
import { StatsTab } from "@/components/ledger/StatsTab";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TransactionInput } from "@/components/ledger/TransactionInput";
import { useLedgerData } from "@/hooks/useLedgerData";

import { LedgerSwitcher } from "@/components/ledger/LedgerSwitcher";
import { TaskCenter } from "@/components/TaskCenter";

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
    confirmedGroups,
    queuedReceipts,
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

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Top Navigation */}
      <header className="bg-surface border-b border-border sticky top-0 z-50 backdrop-blur-md bg-surface/80 supports-[backdrop-filter]:bg-surface/60">
        <div className="w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto px-4 h-14 flex justify-between items-center transition-all duration-300">
          <div className="flex items-center gap-3">
            <LedgerSwitcher currentLedgerId={ledgerId} />
            <TaskCenter ledgerId={ledgerId} />
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/ledger/${ledgerId}/settings`}>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted hover:text-text h-8 w-8 sm:h-9 sm:w-9"
                title="设置"
              >
                <Settings className="h-5 w-5" />
              </Button>
            </Link>
            <ThemeToggle />
            <Button
              size="sm"
              onClick={() => setIsInputOpen(true)}
              className="hidden md:flex rounded-full h-8 w-8 p-0"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header >

      <main className="w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto p-4 transition-all duration-300">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full space-y-4"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="history">账单</TabsTrigger>
            <TabsTrigger value="details">明细</TabsTrigger>
            <TabsTrigger value="stats">统计</TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="mt-0">
            <TransactionsTab
              ledgerId={ledgerId}
              pendingGroups={pendingGroups}
              confirmedGroups={confirmedGroups}
              queuedReceipts={queuedReceipts}
              categories={categories}
              defaultCollapsed={ledger.collapsePendingDefault}
            />
          </TabsContent>

          <TabsContent value="details" className="mt-0">
            <DetailsTab
              ledgerId={ledgerId}
              categories={categories}
            />
          </TabsContent>

          <TabsContent value="stats" className="mt-0">
            <StatsTab ledgerId={ledgerId} />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={isInputOpen} onOpenChange={setIsInputOpen}>
        <DialogContent className="sm:max-w-md top-[20%] translate-y-0 w-[calc(100%-2rem)] mx-auto rounded-xl">
          <DialogHeader>
            <DialogTitle>记一笔</DialogTitle>
          </DialogHeader>
          <TransactionInput
            ledgerId={ledgerId}
            onSuccess={() => setIsInputOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Mobile Floating Action Button (FAB) */}
      <div className="fixed bottom-6 right-6 z-50 md:hidden">
        <Button
          size="lg"
          onClick={() => setIsInputOpen(true)}
          className="rounded-full h-14 w-14 p-0 shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>
    </div >
  );
}
