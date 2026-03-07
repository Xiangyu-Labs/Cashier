"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/i18n/routing";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getLedgerAction, getLedgersAction } from "@/features/ledger/server/actions/ledgers";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LedgerEntriesTab } from "../LedgerEntriesTab";
import { DetailsTab } from "../DetailsTab";
import { StatsTab } from "../StatsTab";
import { SettingsTab } from "../SettingsTab";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SourceDocumentInput } from "@/features/source-document/components/SourceDocumentInput";
import { QuickEntryForm } from "@/features/source-document/components/QuickEntryForm";
import { cn } from "@/lib/utils";
import { TaskQueueModal } from "@/features/task-queue/components/TaskQueueModal";
import { useTaskQueue } from "@/features/task-queue/client/hooks/useTaskQueue";
import { useTranslations } from "next-intl";
import { ModalStackRenderer } from "@/components/providers/ModalStackRenderer";
import { PeriodParams } from "@/lib/period-utils";
import { usePeriodFilter } from "@/features/ledger/client/hooks/usePeriodFilter";
import { useLedgerTabs } from "./useLedgerTabs";
import { useDrilldownNavigation } from "./useDrilldownNavigation";
import { usePrefetchRelatedData } from "@/features/ledger/client/hooks/usePrefetchRelatedData";
import { Header } from "./Header";

interface LedgerPageClientProps {
  ledgerId: string;
  initialPeriod: PeriodParams;
}

const STALE_TIME = 10 * 60 * 1000;
const INPUT_PREFETCH_DELAY = 2000; // 2秒后预加载记一笔弹窗数据

export function LedgerPageClient({ ledgerId, initialPeriod }: LedgerPageClientProps) {
  const t = useTranslations("LedgerPage");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { data: ledger } = useQuery({
    queryKey: queryKeys.ledger(ledgerId),
    queryFn: () => getLedgerAction(ledgerId),
    staleTime: STALE_TIME,
  });

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.entryCategories(ledgerId),
    queryFn: () => getEntryCategoriesAction(ledgerId),
    staleTime: STALE_TIME,
  });

  const { data: allLedgers = [] } = useQuery({
    queryKey: queryKeys.ledgers(),
    queryFn: () => getLedgersAction(),
    staleTime: STALE_TIME,
  });

  const { activeTab, handleTabChange } = useLedgerTabs({
    searchParams,
    pathname,
  });

  const [advancedFilters, setAdvancedFilters] = useState({
    categoryId: null as string | null,
    currency: null as string | null,
    minAmount: null as number | null,
    maxAmount: null as number | null,
  });

  const monthStartDay = ledger?.metadata?.settings?.monthStartDay || 1;
  const mainCurrency = ledger?.metadata?.settings?.mainCurrency || "CNY";
  const {
    periodParams,
    handlePeriodChange,
    handleFiltersChange,
  } = usePeriodFilter({ pathname, searchParams, initialPeriod, monthStartDay });

  const { handleCategoryDrilldown, handleDateDrilldown } = useDrilldownNavigation({
    searchParams,
    pathname,
    setActiveTab: (tab) => handleTabChange(tab),
    setAdvancedFilters,
    handlePeriodChange,
  });

  const handleAdvancedFiltersChange = useCallback((filters: {
    categoryId?: string | null;
    currency?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
  }) => {
    setAdvancedFilters((prev) => ({
      ...prev,
      ...filters,
    }));
  }, []);

  const [isInputOpen, setIsInputOpen] = useState(false);
  const [inputMode, setInputMode] = useState<"ai" | "quick">("ai");
  const [isPendingOpen, setIsPendingOpen] = useState(false);

  const { stats: pendingStats } = useTaskQueue(ledgerId);

  // 预加载其他 Tab 数据（一次点击可达）
  usePrefetchRelatedData({
    ledgerId,
    activeTab: activeTab as "history" | "details" | "stats" | "settings",
    ledger: ledger || undefined,
    categories: categories || [],
    periodParams,
  });

  // 预加载记一笔弹窗数据（当弹窗关闭时）
  useEffect(() => {
    if (!isInputOpen && ledgerId) {
      const timer = setTimeout(() => {
        // 预加载 ledger 数据（SourceDocumentInput 需要）
        if (!queryClient.getQueryData(queryKeys.ledger(ledgerId))) {
          queryClient.prefetchQuery({
            queryKey: queryKeys.ledger(ledgerId),
            queryFn: () => getLedgerAction(ledgerId),
            staleTime: STALE_TIME,
          });
        }
      }, INPUT_PREFETCH_DELAY);
      return () => clearTimeout(timer);
    }
  }, [isInputOpen, ledgerId, queryClient]);

  if (!ledger) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-muted">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <Header
        ledger={ledger}
        pendingStats={pendingStats}
        onOpenTaskQueue={() => setIsPendingOpen(true)}
        onOpenInput={() => setIsInputOpen(true)}
      />

      <main className="w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto p-4 transition-all duration-300">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="history">{t("history")}</TabsTrigger>
            <TabsTrigger value="details">{t("details")}</TabsTrigger>
            <TabsTrigger value="stats">{t("stats")}</TabsTrigger>
            <TabsTrigger value="settings">{t("settings")}</TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="mt-0">
            <LedgerEntriesTab
              ledgerId={ledgerId}
              categories={categories || []}
              ledger={ledger}
              periodParams={periodParams}
              onPeriodChange={handlePeriodChange}
              onFiltersChange={handleFiltersChange}
              monthStartDay={monthStartDay}
            />
          </TabsContent>

          <TabsContent value="details" className="mt-0">
            <DetailsTab
              ledgerId={ledgerId}
              categories={categories || []}
              ledger={ledger}
              periodParams={periodParams}
              onPeriodChange={handlePeriodChange}
              _onFiltersChange={handleFiltersChange}
              advancedFilters={advancedFilters}
              onAdvancedFiltersChange={handleAdvancedFiltersChange}
              monthStartDay={monthStartDay}
            />
          </TabsContent>

          <TabsContent value="stats" className="mt-0">
            <StatsTab
              ledgerId={ledgerId}
              ledger={ledger}
              onCategoryDrilldown={handleCategoryDrilldown}
              onDateDrilldown={handleDateDrilldown}
            />
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <SettingsTab
              ledgerId={ledgerId}
              ledger={ledger}
              initialCategories={categories}
              allLedgers={allLedgers}
            />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={isInputOpen} onOpenChange={(open) => {
        setIsInputOpen(open);
        if (!open) setInputMode("ai");
      }}>
        <DialogContent className="sm:max-w-md top-[15%] sm:top-[20%] translate-y-0 w-[calc(100%-1rem)] sm:w-full mx-auto rounded-xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("newRecord")}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-1 p-1 bg-surface2 rounded-lg">
            <button
              onClick={() => setInputMode("ai")}
              className={cn(
                "flex-1 py-1.5 text-sm font-medium rounded-md transition-colors",
                inputMode === "ai"
                  ? "bg-surface text-text shadow-sm"
                  : "text-muted-foreground hover:text-text"
              )}
            >
              {t("aiParse")}
            </button>
            <button
              onClick={() => setInputMode("quick")}
              className={cn(
                "flex-1 py-1.5 text-sm font-medium rounded-md transition-colors",
                inputMode === "quick"
                  ? "bg-surface text-text shadow-sm"
                  : "text-muted-foreground hover:text-text"
              )}
            >
              {t("quickEntry")}
            </button>
          </div>

          {inputMode === "ai" ? (
            <SourceDocumentInput ledgerId={ledgerId} onSuccess={() => setIsInputOpen(false)} />
          ) : (
            <QuickEntryForm ledgerId={ledgerId} categories={categories} mainCurrency={mainCurrency} onSuccess={() => setIsInputOpen(false)} />
          )}
        </DialogContent>
      </Dialog>

      <TaskQueueModal ledgerId={ledgerId} open={isPendingOpen} onOpenChange={setIsPendingOpen} />
      <ModalStackRenderer categories={categories} />
    </div>
  );
}

export { useLedgerTabs } from "./useLedgerTabs";
export { useDrilldownNavigation } from "./useDrilldownNavigation";
export { Header } from "./Header";
