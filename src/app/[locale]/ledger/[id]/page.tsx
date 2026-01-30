"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Plus, Settings } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LedgerEntriesTab } from "@/components/ledger/LedgerEntriesTab";
import { DetailsTab } from "@/components/ledger/DetailsTab";
import { StatsTab } from "@/components/ledger/StatsTab";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SourceDocumentInput } from "@/components/ledger/SourceDocumentInput";
import { useLedgerData } from "@/hooks/useLedgerData";
import { useLedgerEvents } from "@/lib/events/use-ledger-events";

import { LedgerSwitcher } from "@/components/ledger/LedgerSwitcher";
import { useTranslations } from "next-intl";
import { Link as I18nLink } from "@/i18n/routing";

export default function LedgerPage() {
  const params = useParams();
  const t = useTranslations("LedgerPage");
  const ledgerId = params.id as string;
  const [activeTab, setActiveTab] = useState("history");
  const [isInputOpen, setIsInputOpen] = useState(false);

  const {
    ledger,
    isLedgerLoading,
    categories,
    pendingGroups,
    confirmedGroups,
    queuedSourceDocuments,
  } = useLedgerData(ledgerId);

  // Enable real-time updates
  useLedgerEvents(ledgerId);


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
        <p className="text-muted">{t("notFound")}</p>
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
          </div>
          <div className="flex items-center gap-2">
            <I18nLink href={`/ledger/${ledgerId}/settings`}>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted hover:text-text h-8 w-8 sm:h-9 sm:w-9"
                title={t("settings")}
              >
                <Settings className="h-5 w-5" />
              </Button>
            </I18nLink>
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
            <TabsTrigger value="history">{t("history")}</TabsTrigger>
            <TabsTrigger value="details">{t("details")}</TabsTrigger>
            <TabsTrigger value="stats">{t("stats")}</TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="mt-0">
            <LedgerEntriesTab
              ledgerId={ledgerId}
              pendingGroups={pendingGroups}
              confirmedGroups={confirmedGroups}
              queuedSourceDocuments={queuedSourceDocuments}
              categories={categories}
              defaultCollapsed={ledger.collapsePendingDefault}
              ledger={ledger}
            />
          </TabsContent>

          <TabsContent value="details" className="mt-0">
            <DetailsTab
              ledgerId={ledgerId}
              categories={categories}
              ledger={ledger}
            />
          </TabsContent>

          <TabsContent value="stats" className="mt-0">
            <StatsTab ledgerId={ledgerId} ledger={ledger} />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={isInputOpen} onOpenChange={setIsInputOpen}>
        <DialogContent className="sm:max-w-md top-[20%] translate-y-0 w-[calc(100%-2rem)] mx-auto rounded-xl">
          <DialogHeader>
            <DialogTitle>{t("newRecord")}</DialogTitle>
          </DialogHeader>
          <SourceDocumentInput
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
