"use client";
import { useRef, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/routing";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  EntriesTabSkeleton,
  DetailsTabSkeleton,
  StatsTabSkeleton,
  SettingsTabSkeleton,
} from "@/components/skeletons/TabSkeletons";
import { LEDGER } from "@/lib/constants";
import { type PeriodParams } from "@/lib/period-utils";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import {
  getLedgerAction,
  getEntryCategoriesAction,
} from "@/modules/ledger/actions";
const SourceDocumentInput = dynamic(
  () => import("@/modules/source-document/ui").then(m => m.SourceDocumentInput),
  { ssr: false }
);
const QuickEntryForm = dynamic(
  () => import("@/modules/source-document/ui").then(m => m.QuickEntryForm),
  { ssr: false }
);
import { AppShell } from "./AppShell";
import { TabNavigation } from "./TabNavigation";
import { useDrilldownNavigation, useLedgerTabs, usePeriodFilter } from "../hooks";
import type { LedgerTab } from "../tabs";
import { useLedgerDialogState } from "./useLedgerDialogState";
import { preloadTab, useLedgerPagePrefetching } from "./useLedgerPagePrefetching";

const ModalStackRenderer = dynamic(
  () =>
    import("@/components/providers/ModalStackRenderer").then((module) => ({
      default: module.ModalStackRenderer,
    })),
  { ssr: false }
);

const LedgerEntriesTab = dynamic(
  () =>
    import("@/modules/workspace/ui/LedgerEntriesTab").then((module) => ({
      default: module.LedgerEntriesTab,
    })),
  {
    loading: () => <EntriesTabSkeleton />,
  }
);

const DetailsTab = dynamic(
  () =>
    import("@/modules/workspace/ui/DetailsTab").then((module) => ({
      default: module.DetailsTab,
    })),
  {
    loading: () => <DetailsTabSkeleton />,
  }
);

const StatsTab = dynamic(
  () =>
    import("@/modules/workspace/ui/StatsTab").then((module) => ({
      default: module.StatsTab,
    })),
  {
    loading: () => <StatsTabSkeleton />,
  }
);

const SettingsTab = dynamic(
  () =>
    import("@/modules/ledger/ui").then((module) => ({
      default: module.SettingsTab,
    })),
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

  const { activeTab, handleTabChange } = useLedgerTabs({
    initialTab,
    searchParams,
    pathname,
  });

  const mainCurrency = ledger?.metadata?.settings?.mainCurrency ?? "CNY";
  const preferredCurrencies = ledger?.metadata?.settings?.currencies ?? [];
  const { periodParams, filterParams, handlePeriodChange, handleFiltersChange, applyStreamStatusPreset } = usePeriodFilter({
    pathname,
    searchParams,
    initialPeriod,
  });

  const advancedFilters = filterParams;
  const { handleCategoryDrilldown, handleDateDrilldown } = useDrilldownNavigation({
    searchParams,
    pathname,
  });

  const statusSummaryRef = useRef<HTMLSpanElement | null>(null);

  const handleNeedsAttention = useCallback(() => {
    applyStreamStatusPreset("needs_attention");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        statusSummaryRef.current?.focus();
      });
    });
  }, [applyStreamStatusPreset]);

  const handleInProgress = useCallback(() => {
    applyStreamStatusPreset("in_progress");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        statusSummaryRef.current?.focus();
      });
    });
  }, [applyStreamStatusPreset]);

  const {
    isInputOpen,
    setIsInputOpen,
    inputMode,
    setInputMode,
    handleInputDialogChange,
  } = useLedgerDialogState();

  useLedgerPagePrefetching({
    activeTab,
    isInputOpen,
    ledgerId,
    queryClient,
  });

  if (ledger == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="text-muted">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <AppShell
      ledgerId={ledgerId}
      onOpenInput={() => setIsInputOpen(true)}
      onNeedsAttention={handleNeedsAttention}
      onInProgress={handleInProgress}
    >
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-4">
        <div className="mx-auto flex w-full max-w-4xl justify-center px-2 md:justify-start md:px-0">
          <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} onTabIntent={preloadTab} />
        </div>

          <TabsContent value="stream" className="mt-0">
            <Suspense fallback={<EntriesTabSkeleton />}>
              <LedgerEntriesTab
                ledgerId={ledgerId}
                categories={categories.length > 0 ? categories : []}
                ledger={ledger}
                periodParams={periodParams}
                onPeriodChange={handlePeriodChange}
                onFiltersChange={handleFiltersChange}
                advancedFilters={advancedFilters}
                collapseEntriesDefault={ledger.metadata?.settings?.collapseEntriesDefault ?? false}
                onApplyPreset={applyStreamStatusPreset}
                statusSummaryRef={statusSummaryRef}
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
                onFiltersChange={handleFiltersChange}
                advancedFilters={advancedFilters}
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
                {...(initialStatsDate !== undefined ? { initialDate: initialStatsDate } : {})}
              />
            </Suspense>
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <Suspense fallback={<SettingsTabSkeleton />}>
              <SettingsTab
                ledgerId={ledgerId}
                ledger={ledger}
                initialCategories={categories}
              />
            </Suspense>
          </TabsContent>
        </Tabs>

      <Dialog open={isInputOpen} onOpenChange={handleInputDialogChange}>
        <DialogContent
          className="bottom-0 top-auto mx-auto max-h-[calc(100svh-1rem)] w-full translate-y-0 overflow-y-auto rounded-b-none rounded-t-lg border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:bottom-auto sm:top-[20%] sm:w-full sm:max-w-md sm:rounded-lg sm:p-6"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>{t("newRecord")}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-1 rounded-md border border-border bg-surface2 p-1">
            <button
              onClick={() => setInputMode("ai")}
              className={cn(
                "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
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
                "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
                inputMode === "quick"
                  ? "bg-surface text-text shadow-sm"
                  : "text-muted-foreground hover:text-text"
              )}
            >
              {t("quickEntry")}
            </button>
          </div>

          {/* 静态导入的组件，代码已加载，切换时无延迟，无需骨架屏 */}
          {inputMode === "ai" ? (
            <SourceDocumentInput ledgerId={ledgerId} onSuccess={() => setIsInputOpen(false)} />
          ) : (
            <QuickEntryForm
              ledgerId={ledgerId}
              categories={categories}
              mainCurrency={mainCurrency}
              preferredCurrencies={preferredCurrencies}
              onSuccess={() => setIsInputOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ModalStackRenderer categories={categories} />
    </AppShell>
  );
}
