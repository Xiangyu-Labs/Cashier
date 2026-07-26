"use client";
import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "@/i18n/routing";
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
import { getLedgerAction, getEntryCategoriesAction } from "@/modules/ledger/actions";
import { DeferredFeatureMessages } from "@/i18n/DeferredFeatureMessages";
import { useShellController } from "@/app/[locale]/(protected)/shell-controller";
import { LedgerEntriesTab } from "@/modules/workspace/ui/LedgerEntriesTab";
import { useDrilldownNavigation, useLedgerTabs, usePeriodFilter } from "../hooks";
import type { LedgerTab } from "../tabs";
import { useLedgerDialogState } from "./useLedgerDialogState";
import { initRefreshCoordinator } from "@/modules/source-document/hooks/revision-state-refresh";

// Dynamic imports for inactive tabs — keeps their dependencies
// (Framer Motion for DetailsTab/StatsTab, heavy bundle for SettingsTab)
// out of the initial Stream bundle.
// Each inactive tab is lazily loaded by next/dynamic; its locale messages
// are loaded separately via DeferredFeatureMessages at the usage site
// so that the locale prop is available from the parent component scope.
const DetailsTab = dynamic(
  () => import("@/modules/workspace/ui/DetailsTab").then((m) => m.DetailsTab),
  { loading: () => <DetailsTabSkeleton /> }
);

const StatsTab = dynamic(() => import("@/modules/workspace/ui/StatsTab").then((m) => m.StatsTab), {
  loading: () => <StatsTabSkeleton />,
});

const SettingsTab = dynamic(
  () => import("@/modules/ledger/ui/SettingsTab").then((m) => m.SettingsTab),
  { loading: () => <SettingsTabSkeleton /> }
);

// Keep dynamic imports for dialog-only components that aren't on the default path
const SourceDocumentInput = dynamic(
  () =>
    import("@/modules/source-document/ui/SourceDocumentInput").then((m) => ({
      default: m.SourceDocumentInput,
    })),
  { ssr: false }
);
const QuickEntryForm = dynamic(
  () =>
    import("@/modules/source-document/ui/QuickEntryForm").then((m) => ({
      default: m.QuickEntryForm,
    })),
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
  const locale = useLocale();
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

  const { activeTab, handleTabChange: _handleTabChange } = useLedgerTabs({
    initialTab,
    searchParams,
    pathname,
  });

  const mainCurrency = ledger?.metadata?.settings?.mainCurrency ?? "CNY";
  const preferredCurrencies = ledger?.metadata?.settings?.currencies ?? [];
  const { periodParams, filterParams, handleFiltersChange, applyStreamStatusPreset } =
    usePeriodFilter({
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

  // Initialize the refresh coordinator for this ledger
  // This enables cross-tab leadership, bounded polling, and cache patches.
  const queryClient = useQueryClient();
  const coordinatorRef = useRef<ReturnType<typeof initRefreshCoordinator> | null>(null);
  useEffect(() => {
    coordinatorRef.current = initRefreshCoordinator(ledgerId, queryClient);
    return () => {
      coordinatorRef.current?.destroy();
      coordinatorRef.current = null;
    };
  }, [ledgerId, queryClient]);

  const { isInputOpen, setIsInputOpen, inputMode, setInputMode, handleInputDialogChange } =
    useLedgerDialogState();

  // Wire the real new-record handler into the shell once this component mounts.
  const { setOpenInput } = useShellController();

  useEffect(() => {
    setOpenInput(() => () => setIsInputOpen(true));
  }, [setOpenInput, setIsInputOpen]);

  if (ledger == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="text-muted">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <>
      {/* Only mount the active tab — inactive tabs load lazily */}
      {activeTab === "stream" && (
        <div className="mt-0">
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
        </div>
      )}

      {activeTab === "details" && (
        <div className="mt-0">
          <DeferredFeatureMessages
            feature="details"
            locale={locale}
            fallback={<DetailsTabSkeleton />}
          >
            <DetailsTab
              ledgerId={ledgerId}
              categories={categories.length > 0 ? categories : []}
              ledger={ledger}
              periodParams={periodParams}
              onFiltersChange={handleFiltersChange}
              advancedFilters={advancedFilters}
            />
          </DeferredFeatureMessages>
        </div>
      )}

      {activeTab === "stats" && (
        <div className="mt-0">
          <DeferredFeatureMessages feature="stats" locale={locale} fallback={<StatsTabSkeleton />}>
            <StatsTab
              ledgerId={ledgerId}
              ledger={ledger}
              onCategoryDrilldown={handleCategoryDrilldown}
              onDateDrilldown={handleDateDrilldown}
              {...(initialStatsDate !== undefined ? { initialDate: initialStatsDate } : {})}
            />
          </DeferredFeatureMessages>
        </div>
      )}

      {activeTab === "settings" && (
        <div className="mt-0">
          <DeferredFeatureMessages
            feature="settings"
            locale={locale}
            fallback={<SettingsTabSkeleton />}
          >
            <SettingsTab
              ledgerId={ledgerId}
              ledger={ledger}
              initialCategories={categories}
              {...(userEmail !== undefined ? { userEmail } : {})}
            />
          </DeferredFeatureMessages>
        </div>
      )}

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
    </>
  );
}
