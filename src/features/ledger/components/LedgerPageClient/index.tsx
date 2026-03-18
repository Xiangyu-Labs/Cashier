"use client";

import { useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/i18n/routing";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  getLedgerAction,
  getLedgersAction,
  getEntryCategoriesAction,
} from "@/modules/ledger/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useTaskQueue } from "@/features/task-queue/client";
import { useTranslations } from "next-intl";
import { LEDGER } from "@/lib/constants";
import { updateLedgerSearchParams } from "@/features/ledger/client/ledger-url-params";
import { replaceLedgerUrl } from "@/features/ledger/client/ledger-url-navigation";
import { useLedgerDialogState } from "./useLedgerDialogState";
import { useLedgerPagePrefetching } from "./useLedgerPagePrefetching";

// Lazy load modal components to reduce initial bundle
const SourceDocumentInput = dynamic(
  () =>
    import("@/features/source-document/components").then((m) => ({
      default: m.SourceDocumentInput,
    })),
  { ssr: false }
);

const QuickEntryForm = dynamic(
  () =>
    import("@/features/source-document/components").then((m) => ({
      default: m.QuickEntryForm,
    })),
  { ssr: false }
);

const TaskQueueModal = dynamic(
  () =>
    import("@/features/task-queue/components").then((m) => ({
      default: m.TaskQueueModal,
    })),
  { ssr: false }
);

const ModalStackRenderer = dynamic(
  () =>
    import("@/components/providers/ModalStackRenderer").then((m) => ({
      default: m.ModalStackRenderer,
    })),
  { ssr: false }
);
import { type PeriodParams } from "@/lib/period-utils";
import { usePeriodFilter } from "@/features/ledger/client/hooks/use-period-filter";
import { useLedgerTabs } from "./useLedgerTabs";
import { useDrilldownNavigation } from "./useDrilldownNavigation";
import { Header } from "./Header";
import type { LedgerTab } from "@/features/ledger/lib/tabs";
import {
  EntriesTabSkeleton,
  DetailsTabSkeleton,
  StatsTabSkeleton,
  SettingsTabSkeleton,
} from "@/components/skeletons/TabSkeletons";

// Lazy load tab components to reduce initial bundle size
const LedgerEntriesTab = dynamic(
  () => import("../LedgerEntriesTab").then((m) => ({ default: m.LedgerEntriesTab })),
  {
    loading: () => <EntriesTabSkeleton />,
  }
);

const DetailsTab = dynamic(() => import("../DetailsTab").then((m) => ({ default: m.DetailsTab })), {
  loading: () => <DetailsTabSkeleton />,
});

const StatsTab = dynamic(() => import("../StatsTab").then((m) => ({ default: m.StatsTab })), {
  loading: () => <StatsTabSkeleton />,
});

const SettingsTab = dynamic(
  () => import("../SettingsTab").then((m) => ({ default: m.SettingsTab })),
  {
    loading: () => <SettingsTabSkeleton />,
  }
);

interface LedgerPageClientProps {
  ledgerId: string;
  initialTab: LedgerTab;
  initialPeriod: PeriodParams;
  initialStatsDate?: Date;
}

const STALE_TIME = LEDGER.STALE_TIME_MS;
export function LedgerPageClient({
  ledgerId,
  initialTab,
  initialPeriod,
  initialStatsDate,
}: LedgerPageClientProps) {
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
    initialTab,
    searchParams,
    pathname,
  });

  const mainCurrency = ledger?.metadata?.settings?.mainCurrency ?? "CNY";
  const { periodParams, filterParams, handlePeriodChange, handleFiltersChange } = usePeriodFilter({
    pathname,
    searchParams,
    initialPeriod,
  });

  // 使用原始的 handleTabChange

  // Advanced filters now come from URL (single source of truth)
  const advancedFilters = filterParams;

  const { handleCategoryDrilldown, handleDateDrilldown } = useDrilldownNavigation({
    searchParams,
    pathname,
  });

  // Update URL when user changes advanced filters
  const handleAdvancedFiltersChange = useCallback(
    (filters: {
      categoryId?: string | null;
      currency?: string | null;
      minAmount?: number | null;
      maxAmount?: number | null;
    }) => {
      const params = updateLedgerSearchParams(searchParams, filters);
      replaceLedgerUrl(pathname, params);
    },
    [pathname, searchParams]
  );

  const {
    isInputOpen,
    setIsInputOpen,
    inputMode,
    setInputMode,
    isPendingOpen,
    setIsPendingOpen,
    handleInputDialogChange,
  } = useLedgerDialogState();

  const { stats: pendingStats } = useTaskQueue(ledgerId);

  useLedgerPagePrefetching({
    activeTab,
    isInputOpen,
    ledgerId,
    queryClient,
  });

  if (ledger === undefined || ledger === null) {
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
            <TabsTrigger value="stream">{t("stream")}</TabsTrigger>
            <TabsTrigger value="details">{t("details")}</TabsTrigger>
            <TabsTrigger value="stats">{t("stats")}</TabsTrigger>
            <TabsTrigger value="settings">{t("settings")}</TabsTrigger>
          </TabsList>

          <TabsContent value="stream" className="mt-0">
            <Suspense fallback={<EntriesTabSkeleton />}>
              <LedgerEntriesTab
                ledgerId={ledgerId}
                categories={categories.length > 0 ? categories : []}
                ledger={ledger}
                periodParams={periodParams}
                onPeriodChange={handlePeriodChange}
                onFiltersChange={handleFiltersChange}
                collapseEntriesDefault={ledger.metadata?.settings?.collapseEntriesDefault ?? false}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="details" className="mt-0">
            <Suspense fallback={<DetailsTabSkeleton />}>
              <DetailsTab
                ledgerId={ledgerId}
                categories={categories.length > 0 ? categories : []}
                ledger={ledger}
                periodParams={periodParams}
                onPeriodChange={handlePeriodChange}
                _onFiltersChange={handleFiltersChange}
                advancedFilters={advancedFilters}
                onAdvancedFiltersChange={handleAdvancedFiltersChange}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="stats" className="mt-0">
            <Suspense fallback={<StatsTabSkeleton />}>
              <StatsTab
                ledgerId={ledgerId}
                ledger={ledger}
                onCategoryDrilldown={handleCategoryDrilldown}
                onDateDrilldown={handleDateDrilldown}
                initialDate={initialStatsDate}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <Suspense fallback={<SettingsTabSkeleton />}>
              <SettingsTab
                ledgerId={ledgerId}
                ledger={ledger}
                initialCategories={categories}
                allLedgers={allLedgers}
              />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog
        open={isInputOpen}
        onOpenChange={handleInputDialogChange}
      >
        <DialogContent
          className="sm:max-w-md top-[15%] sm:top-[20%] translate-y-0 w-[calc(100%-1rem)] sm:w-full mx-auto rounded-xl"
          aria-describedby={undefined}
        >
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
            <QuickEntryForm
              ledgerId={ledgerId}
              categories={categories}
              mainCurrency={mainCurrency}
              onSuccess={() => setIsInputOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <TaskQueueModal ledgerId={ledgerId} open={isPendingOpen} onOpenChange={setIsPendingOpen} />
      <ModalStackRenderer categories={categories} />
    </div>
  );
}
