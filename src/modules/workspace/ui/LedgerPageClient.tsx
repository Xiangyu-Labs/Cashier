"use client";
import { useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/routing";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
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
import { LedgerEntriesTab } from "@/modules/workspace/ui/LedgerEntriesTab";
import { AppShell } from "./AppShell";
import { TabNavigation } from "./TabNavigation";
import { useDrilldownNavigation, useLedgerTabs, usePeriodFilter } from "../hooks";
import type { LedgerTab } from "../tabs";
import { useLedgerDialogState } from "./useLedgerDialogState";

// Dynamic imports for inactive tabs — keeps their dependencies
// (Framer Motion for DetailsTab/StatsTab, heavy bundle for SettingsTab)
// out of the initial Stream bundle. Pointer-intent preload via
// onTabIntent starts loading the chunk on hover/focus.
const DetailsTab = dynamic(
  () =>
    import("@/modules/workspace/ui/DetailsTab").then((m) => ({
      default: m.DetailsTab,
    })),
  { loading: () => <DetailsTabSkeleton /> }
);

const StatsTab = dynamic(
  () =>
    import("@/modules/workspace/ui/StatsTab").then((m) => ({
      default: m.StatsTab,
    })),
  { loading: () => <StatsTabSkeleton /> }
);

const SettingsTab = dynamic(
  () =>
    import("@/modules/ledger/ui/SettingsTab").then((m) => ({
      default: m.SettingsTab,
    })),
  { loading: () => <SettingsTabSkeleton /> }
);

// Keep dynamic imports for dialog-only components that aren't on the default path
const SourceDocumentInput = dynamic(
  () => import("@/modules/source-document/ui/SourceDocumentInput").then((m) => ({ default: m.SourceDocumentInput })),
  { ssr: false }
);
const QuickEntryForm = dynamic(
  () => import("@/modules/source-document/ui/QuickEntryForm").then((m) => ({ default: m.QuickEntryForm })),
  { ssr: false }
);

const ModalStackRenderer = dynamic(
  () =>
    import("@/components/providers/ModalStackRenderer").then((module) => ({
      default: module.ModalStackRenderer,
    })),
  { ssr: false }
);

interface LedgerPageClientProps {
  ledgerId: string;
  initialTab: LedgerTab;
  initialPeriod: PeriodParams;
  initialStatsDate?: Date;
  /** Server-derived user email for the Settings tab (avoids useSession). */
  userEmail?: string;
}

const STALE_TIME = LEDGER.STALE_TIME_MS;

export function LedgerPageClient({
  ledgerId,
  initialTab,
  initialPeriod,
  initialStatsDate,
  userEmail,
}: LedgerPageClientProps) {
  const t = useTranslations("LedgerPage");
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
  const { periodParams, filterParams, handleFiltersChange, applyStreamStatusPreset } = usePeriodFilter({
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

  // Preload inactive tab chunks on pointer intent (hover/focus)
  const preloadTab = useCallback((tab: LedgerTab) => {
    if (tab === "details") {
      import("@/modules/workspace/ui/DetailsTab");
    } else if (tab === "stats") {
      import("@/modules/workspace/ui/StatsTab");
    } else if (tab === "settings") {
      import("@/modules/ledger/ui/SettingsTab");
    }
  }, []);

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
          <TabNavigation
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onTabIntent={preloadTab}
          />
        </div>

        {/* Only mount the active tab — inactive tabs load lazily */}
        {activeTab === "stream" && (
          <TabsContent value="stream" className="mt-0">
            <LedgerEntriesTab
              ledgerId={ledgerId}
              categories={categories.length > 0 ? categories : []}
              ledger={ledger}
              periodParams={periodParams}
              onFiltersChange={handleFiltersChange}
              advancedFilters={advancedFilters}
              collapseEntriesDefault={ledger.metadata?.settings?.collapseEntriesDefault ?? false}
              onApplyPreset={applyStreamStatusPreset}
              statusSummaryRef={statusSummaryRef}
            />
          </TabsContent>
        )}

        {activeTab === "details" && (
          <TabsContent value="details" className="mt-0">
            <DetailsTab
              ledgerId={ledgerId}
              categories={categories.length > 0 ? categories : []}
              ledger={ledger}
              periodParams={periodParams}
              onFiltersChange={handleFiltersChange}
              advancedFilters={advancedFilters}
            />
          </TabsContent>
        )}

        {activeTab === "stats" && (
          <TabsContent value="stats" className="mt-0">
            <StatsTab
              ledgerId={ledgerId}
              ledger={ledger}
              onCategoryDrilldown={handleCategoryDrilldown}
              onDateDrilldown={handleDateDrilldown}
              {...(initialStatsDate !== undefined ? { initialDate: initialStatsDate } : {})}
            />
          </TabsContent>
        )}

        {activeTab === "settings" && (
          <TabsContent value="settings" className="mt-0">
            <SettingsTab
              ledgerId={ledgerId}
              ledger={ledger}
              initialCategories={categories}
              {...(userEmail !== undefined ? { userEmail } : {})}
            />
          </TabsContent>
        )}
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
