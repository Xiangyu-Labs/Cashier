"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useMessages, useTranslations } from "next-intl";
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
import { FEATURE_MESSAGES } from "@/i18n/client-feature-messages";
import { useFeatureMessages } from "@/i18n/use-feature-messages";
import { useShellController } from "@/components/providers/shell-controller";
import { LedgerEntriesTab } from "@/modules/workspace/ui/LedgerEntriesTab";
import {
  useDrilldownNavigation,
  useLedgerHistorySync,
  useLedgerTabs,
  usePeriodFilter,
} from "../hooks";
import { useActiveTabQueryState } from "../hooks/useActiveTabQueryState";
import { useNewRecordDialogState } from "../hooks/useNewRecordDialogState";
import type { LedgerTab } from "@/lib/ledger-tabs";
import type { InterfaceLanguage } from "@/modules/auth/contracts";
import { LedgerQueryErrorBanner } from "@/modules/workspace/ui/LedgerQueryErrorBanner";
import type { EntryCategoryWithCount, LedgerDto } from "@/modules/ledger/contracts";
import type { TabQueryStateReport } from "@/components/tab-query-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";
import { NewRecordForms, InputFormLoadingFallback, preloadNewRecordModules } from "./NewRecordForms";
import { ModalStackLoadingFallback } from "./ModalStackLoadingFallback";
import { RefreshButton } from "@/components/ui/refresh-button";

// Dynamic imports keep inactive tab dependencies out of the initial Stream bundle.
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

const ModalStackRenderer = dynamic(
  () =>
    import("@/modules/workspace/ui/ModalStackRenderer").then((module) => ({
      default: module.ModalStackRenderer,
    })),
  { ssr: false, loading: () => <ModalStackLoadingFallback /> }
);

interface LedgerPageClientProps {
  ledgerId: string;
  initialLedger?: LedgerDto;
  initialTab: LedgerTab;
  initialPeriod: PeriodParams;
  ledgerToday?: string;
  initialCategories?: EntryCategoryWithCount[];
  /** Server-derived user email for the Settings tab (avoids useSession). */
  userEmail?: string;
  hasPassword?: boolean;
  passwordUpdatedAt?: string | null;
  interfaceLanguage?: InterfaceLanguage;
}

function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded bg-surface2", className)} />;
}

function getFeatureForTab(activeTab: LedgerTab): keyof typeof FEATURE_MESSAGES {
  return activeTab === "details"
    ? "details"
    : activeTab === "stats"
      ? "stats"
      : activeTab === "settings"
        ? "settings"
        : "stream";
}

const STALE_TIME = LEDGER.STALE_TIME_MS;
const subscribeToDeviceTimeZone = () => () => {};
const getDeviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const getServerTimeZone = () => undefined;

export function LedgerPageClient({
  ledgerId,
  initialLedger,
  initialTab,
  initialPeriod,
  ledgerToday,
  initialCategories,
  userEmail,
  hasPassword,
  passwordUpdatedAt,
  interfaceLanguage,
}: LedgerPageClientProps) {
  const t = useTranslations("LedgerPage");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: ledger } = useQuery({
    queryKey: queryKeys.ledger(ledgerId),
    queryFn: () => getLedgerAction(ledgerId),
    staleTime: STALE_TIME,
    ...(initialLedger !== undefined ? { initialData: initialLedger } : {}),
  });

  const categoriesQuery = useQuery({
    queryKey: queryKeys.entryCategories(ledgerId),
    queryFn: () => getEntryCategoriesAction(ledgerId),
    staleTime: STALE_TIME,
    ...(initialCategories !== undefined ? { initialData: initialCategories } : {}),
  });
  const categories = categoriesQuery.data ?? [];
  const categoriesHaveNoData = categoriesQuery.data === undefined;

  const { activeTab, handleTabChange: _handleTabChange } = useLedgerTabs({
    initialTab,
    searchParams,
    pathname,
  });
  useLedgerHistorySync({
    pathname,
    searchParams,
    ledgerId,
    legacyScope: activeTab === "details" ? "details" : "stream",
  });

  const parentMessages = useMessages();
  const activeFeature = getFeatureForTab(activeTab);
  const activeFeatureMessages = useFeatureMessages(
    locale,
    activeFeature,
    parentMessages as Record<string, unknown>
  );
  const activeFeatureStatus = activeFeatureMessages.status;
  const retryFeatureMessages = activeFeatureMessages.retry;
  const [tabQueryReport, setTabQueryReport] = useState<TabQueryStateReport | null>(null);
  const handleQueryStateChange = useCallback((report: TabQueryStateReport) => {
    setTabQueryReport(report);
  }, []);

  const mainCurrency = ledger?.settings.mainCurrency ?? "CNY";
  const preferredCurrencies = ledger?.settings.currencies ?? [];
  const fixedTimeZone = ledger?.settings.timeZone ?? undefined;
  const deviceTimeZone = useSyncExternalStore(
    subscribeToDeviceTimeZone,
    getDeviceTimeZone,
    getServerTimeZone
  );
  const effectiveTimeZone = fixedTimeZone ?? deviceTimeZone;
  const { periodParams, filters, filterParams, handleFiltersChange } = usePeriodFilter({
    pathname,
    searchParams,
    initialPeriod,
    scope: activeTab === "details" ? "details" : "stream",
    ...(effectiveTimeZone != null ? { timeZone: effectiveTimeZone } : {}),
  });

  const advancedFilters = filterParams;
  const { activeTabQueryState, retryActiveTab, refreshActiveTab } = useActiveTabQueryState({
    ledgerId,
    activeTab,
    activeFeatureStatus,
    tabQueryReport,
    retryFeatureMessages,
  });
  const { handleCategoryDrilldown, handleDateDrilldown } = useDrilldownNavigation({
    searchParams,
    pathname,
    ledgerId,
  });

  const newRecordDialog = useNewRecordDialogState({ ledgerId });
  const {
    isInputOpen,
    setIsInputOpen,
    inputMode,
    setInputMode,
    setAiPending,
    setQuickPending,
    aiDirty,
    setAiDirty,
    quickDirty,
    setQuickDirty,
    isInputSubmitting,
    handleDialogOpenChange,
    discardConfirmOpen,
    setDiscardConfirmOpen,
    confirmDiscard,
  } = newRecordDialog;
  const dirtyChangeCount = useUnsavedChangesStore((state) => state.dirtyKeys.size);

  useEffect(() => {
    if (dirtyChangeCount === 0) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [dirtyChangeCount]);

  // Wire the real new-record handler into the shell once this component mounts.
  const { setInputIntent, setOpenInput } = useShellController();

  useEffect(() => {
    setOpenInput(() => () => setIsInputOpen(true));
  }, [setOpenInput, setIsInputOpen]);

  useEffect(() => {
    setInputIntent(() => preloadNewRecordModules);
  }, [setInputIntent]);

  if (ledger == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="text-muted">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <>
      <div>
        <div className="flex h-9 items-center justify-end px-2">
          <RefreshButton
            onRefresh={refreshActiveTab}
            isRefreshing={activeTabQueryState === "refreshing"}
            disabled={activeTab === "settings" && dirtyChangeCount > 0}
          />
        </div>
        {/* Only mount the active tab — inactive tabs load lazily */}
        {activeTabQueryState === "error-with-data" ? (
          <LedgerQueryErrorBanner onRetry={retryActiveTab} />
        ) : null}
        {activeTabQueryState === "error-empty" ? (
          <LedgerQueryErrorBanner empty onRetry={retryActiveTab} />
        ) : null}
        {categoriesQuery.isError ? (
          <LedgerQueryErrorBanner
            empty={categoriesHaveNoData}
            onRetry={() => void categoriesQuery.refetch()}
          />
        ) : null}
        {categoriesQuery.isPending && categoriesHaveNoData ? (
          <div className="space-y-3 px-2 py-4" role="status" aria-busy="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}

        <div
          className={
            activeTabQueryState === "error-empty" || categoriesHaveNoData ? "hidden" : undefined
          }
          aria-hidden={activeTabQueryState === "error-empty" || categoriesHaveNoData || undefined}
        >
          {activeTab === "stream" && (
            <div className="mt-0 min-w-0 max-w-full overflow-x-clip">
              <DeferredFeatureMessages feature="stream" locale={locale} fallback={null}>
                <LedgerEntriesTab
                  ledgerId={ledgerId}
                  categories={categories.length > 0 ? categories : []}
                  ledger={ledger}
                  periodParams={periodParams}
                  onFiltersChange={handleFiltersChange}
                  advancedFilters={advancedFilters}
                  collapseEntriesDefault={ledger.settings.collapseEntriesDefault ?? false}
                  onQueryStateChange={handleQueryStateChange}
                  {...(effectiveTimeZone != null ? { timeZone: effectiveTimeZone } : {})}
                />
              </DeferredFeatureMessages>
            </div>
          )}

          {activeTab === "details" && (
            <div className="mt-0 min-w-0 max-w-full overflow-x-clip">
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
                  onQueryStateChange={handleQueryStateChange}
                  {...(effectiveTimeZone != null ? { timeZone: effectiveTimeZone } : {})}
                />
              </DeferredFeatureMessages>
            </div>
          )}

          {activeTab === "stats" && (
            <div className="mt-0 min-w-0 max-w-full overflow-x-clip">
              <DeferredFeatureMessages
                feature="stats"
                locale={locale}
                fallback={<StatsTabSkeleton />}
              >
                <StatsTab
                  ledgerId={ledgerId}
                  ledger={ledger}
                  onCategoryDrilldown={handleCategoryDrilldown}
                  onDateDrilldown={handleDateDrilldown}
                  {...(ledgerToday !== undefined ? { ledgerToday } : {})}
                  onQueryStateChange={handleQueryStateChange}
                  {...(effectiveTimeZone != null ? { timeZone: effectiveTimeZone } : {})}
                />
              </DeferredFeatureMessages>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="mt-0 min-w-0 max-w-full overflow-x-clip">
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
                  {...(hasPassword !== undefined ? { hasPassword } : {})}
                  {...(passwordUpdatedAt !== undefined ? { passwordUpdatedAt } : {})}
                  {...(interfaceLanguage !== undefined ? { interfaceLanguage } : {})}
                  onQueryStateChange={handleQueryStateChange}
                />
              </DeferredFeatureMessages>
            </div>
          )}
        </div>

        <Dialog open={isInputOpen} onOpenChange={handleDialogOpenChange}>
          <DialogContent
            variant="detail"
            className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100vw-2rem)] sm:max-w-md sm:rounded-lg"
            aria-describedby={undefined}
            hideCloseButton={isInputSubmitting}
            onEscapeKeyDown={(event) => {
              if (isInputSubmitting) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (isInputSubmitting) event.preventDefault();
            }}
          >
            <DialogHeader className="shrink-0 border-b px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
              <DialogTitle>{t("newRecord")}</DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-none sm:p-6">
              <div className="flex gap-1 rounded-md border border-border bg-surface2 p-1">
                <button
                  type="button"
                  aria-pressed={inputMode === "ai"}
                  onClick={() => setInputMode("ai")}
                  disabled={isInputSubmitting}
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
                  type="button"
                  aria-pressed={inputMode === "quick"}
                  onClick={() => setInputMode("quick")}
                  disabled={isInputSubmitting}
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

              <div>
                <DeferredFeatureMessages
                  feature="stream"
                  locale={locale}
                  fallback={<InputFormLoadingFallback />}
                >
                  <NewRecordForms
                    ledgerId={ledgerId}
                    activeTab={activeTab}
                    committedFilters={filters}
                    inputMode={inputMode}
                    categories={categories}
                    mainCurrency={mainCurrency}
                    preferredCurrencies={preferredCurrencies}
                    aiDirty={aiDirty}
                    quickDirty={quickDirty}
                    setInputMode={setInputMode}
                    setInputOpen={setIsInputOpen}
                    setAiPending={setAiPending}
                    setQuickPending={setQuickPending}
                    setAiDirty={setAiDirty}
                    setQuickDirty={setQuickDirty}
                    {...(effectiveTimeZone != null ? { timeZone: effectiveTimeZone } : {})}
                  />
                </DeferredFeatureMessages>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={discardConfirmOpen}
          onOpenChange={setDiscardConfirmOpen}
          title={tCommon("unsavedChangesTitle")}
          description={tCommon("unsavedChangesDescription")}
          confirmLabel={tCommon("discard")}
          variant="destructive"
          onConfirm={confirmDiscard}
        />

        <ModalStackRenderer
          categories={categories}
          mainCurrency={mainCurrency}
          preferredCurrencies={preferredCurrencies}
        />
      </div>
    </>
  );
}
