"use client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import type { LedgerTab } from "@/lib/ledger-tabs";
import { useLedgerDialogState } from "./useLedgerDialogState";
import type { InterfaceLanguage } from "@/modules/auth/contracts";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { LedgerQueryErrorBanner } from "@/modules/workspace/ui/LedgerQueryErrorBanner";
import type { EntryCategoryWithCount, LedgerDto } from "@/modules/ledger/contracts";
import type { EntryFilters } from "@/modules/ledger/filters";
import type { CreatedRecordResult } from "@/modules/source-document/contracts";
import type { ActiveTabDataState, TabQueryStateReport } from "@/components/tab-query-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";
import {
  showNewRecordSuccessFeedback,
  type NewRecordInputMode,
} from "./new-record-success-feedback";
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
// Keep dynamic imports for dialog-only components that aren't on the default path
const SourceDocumentInput = dynamic(
  () =>
    import("@/modules/source-document/ui/SourceDocumentInput").then((m) => ({
      default: m.SourceDocumentInput,
    })),
  { ssr: false, loading: () => <InputFormLoadingFallback /> }
);
const QuickEntryForm = dynamic(
  () =>
    import("@/modules/source-document/ui/QuickEntryForm").then((m) => ({
      default: m.QuickEntryForm,
    })),
  { ssr: false, loading: () => <InputFormLoadingFallback /> }
);

export function preloadNewRecordModules() {
  void import("@/modules/source-document/ui/SourceDocumentInput");
  void import("@/modules/source-document/ui/QuickEntryForm");
}

function InputFormLoadingFallback() {
  return (
    <div aria-hidden className="space-y-4 pt-1">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

interface NewRecordFormsProps {
  ledgerId: string;
  activeTab: LedgerTab;
  committedFilters: EntryFilters;
  inputMode: NewRecordInputMode;
  categories: EntryCategoryWithCount[];
  mainCurrency: string;
  preferredCurrencies: string[];
  timeZone?: string;
  aiDirty: boolean;
  quickDirty: boolean;
  setInputMode: (mode: NewRecordInputMode) => void;
  setInputOpen: (open: boolean) => void;
  setAiPending: (pending: boolean) => void;
  setQuickPending: (pending: boolean) => void;
  setAiDirty: (dirty: boolean) => void;
  setQuickDirty: (dirty: boolean) => void;
}

function NewRecordForms({
  ledgerId,
  activeTab,
  committedFilters,
  inputMode,
  categories,
  mainCurrency,
  preferredCurrencies,
  timeZone,
  aiDirty,
  quickDirty,
  setInputMode,
  setInputOpen,
  setAiPending,
  setQuickPending,
  setAiDirty,
  setQuickDirty,
}: NewRecordFormsProps) {
  const tSourceDocument = useTranslations("SourceDocumentInput");
  const tQuickEntry = useTranslations("QuickEntryForm");

  const handleSuccess = useCallback(
    (mode: NewRecordInputMode, result: CreatedRecordResult) => {
      showNewRecordSuccessFeedback({
        mode,
        ledgerId,
        result,
        activeTab,
        committedFilters,
        messages: {
          aiSuccess: tSourceDocument("uploadSuccess"),
          quickSuccess: tQuickEntry("quickEntrySuccess"),
          savedMayBeHidden: tSourceDocument("savedMayBeHidden"),
          viewRecord: tSourceDocument("viewRecord"),
        },
      });

      if (mode === "ai") {
        if (quickDirty) setInputMode("quick");
        else setInputOpen(false);
        return;
      }

      if (aiDirty) setInputMode("ai");
      else setInputOpen(false);
    },
    [
      activeTab,
      aiDirty,
      committedFilters,
      ledgerId,
      quickDirty,
      setInputMode,
      setInputOpen,
      tQuickEntry,
      tSourceDocument,
    ]
  );

  return (
    <>
      <div className={inputMode === "ai" ? undefined : "hidden"} aria-hidden={inputMode !== "ai"}>
        <SourceDocumentInput
          key={ledgerId}
          ledgerId={ledgerId}
          onPendingChange={setAiPending}
          onDirtyChange={setAiDirty}
          {...(timeZone != null ? { timeZone } : {})}
          onSuccess={(result) => handleSuccess("ai", result)}
        />
      </div>
      <div
        className={inputMode === "quick" ? undefined : "hidden"}
        aria-hidden={inputMode !== "quick"}
      >
        <QuickEntryForm
          key={ledgerId}
          ledgerId={ledgerId}
          categories={categories}
          mainCurrency={mainCurrency}
          preferredCurrencies={preferredCurrencies}
          onPendingChange={setQuickPending}
          onDirtyChange={setQuickDirty}
          {...(timeZone != null ? { timeZone } : {})}
          onSuccess={(result) => handleSuccess("quick", result)}
        />
      </div>
    </>
  );
}

const ModalStackRenderer = dynamic(
  () =>
    import("@/modules/workspace/ui/ModalStackRenderer").then((module) => ({
      default: module.ModalStackRenderer,
    })),
  { ssr: false, loading: () => <ModalStackLoadingFallback /> }
);

function ModalStackLoadingFallback() {
  const item = useModalStackStore((state) => state.stack.at(-1));
  const closeAll = useModalStackStore((state) => state.closeAll);
  const tCommon = useTranslations("Common");
  if (item == null) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && closeAll()}>
      <DialogContent
        variant="detail"
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[min(90dvh,800px)] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:rounded-lg"
        aria-describedby={undefined}
      >
        <DialogHeader className="border-b border-border px-4 py-4 sm:px-6">
          <DialogTitle className="sr-only">{tCommon("loading")}</DialogTitle>
          <Skeleton className="h-5 w-40" />
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-5 overflow-hidden p-4 sm:grid-cols-[minmax(0,1fr)_18rem] sm:p-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <Skeleton className="hidden h-full min-h-64 sm:block" />
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded bg-surface2", className)} />;
}

interface LedgerPageClientProps {
  ledgerId: string;
  initialLedger?: LedgerDto;
  initialTab: LedgerTab;
  initialPeriod: PeriodParams;
  initialStatsDate?: Date;
  initialCategories?: EntryCategoryWithCount[];
  /** Server-derived user email for the Settings tab (avoids useSession). */
  userEmail?: string;
  hasPassword?: boolean;
  passwordUpdatedAt?: string | null;
  interfaceLanguage?: InterfaceLanguage;
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

function getActiveTabQueryState(
  ledgerId: string,
  activeTab: LedgerTab,
  featureStatus: "loading" | "success" | "error",
  report: TabQueryStateReport | null
): ActiveTabDataState {
  const matchingReport =
    report != null && report.ledgerId === ledgerId && report.tab === activeTab ? report : null;
  if (featureStatus === "error") {
    return matchingReport?.hasData === true ? "error-with-data" : "error-empty";
  }
  if (featureStatus !== "success" || matchingReport == null) return "initial-loading";
  if (matchingReport.status === "error") {
    return matchingReport.hasData ? "error-with-data" : "error-empty";
  }
  if (matchingReport.status === "pending" || !matchingReport.hasData) return "initial-loading";
  if (matchingReport.isFetching) return "refreshing";
  return "ready";
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
  initialStatsDate,
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

  const queryClient = useQueryClient();
  const { data: ledger } = useQuery({
    queryKey: queryKeys.ledger(ledgerId),
    queryFn: () => getLedgerAction(ledgerId),
    staleTime: STALE_TIME,
    ...(initialLedger !== undefined ? { initialData: initialLedger } : {}),
  });

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.entryCategories(ledgerId),
    queryFn: () => getEntryCategoriesAction(ledgerId),
    staleTime: STALE_TIME,
    ...(initialCategories !== undefined ? { initialData: initialCategories } : {}),
  });

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
  const {
    periodParams,
    filters,
    filterParams,
    handleFiltersChange,
    applyStreamStatusPreset,
    resetFilters,
  } = usePeriodFilter({
    pathname,
    searchParams,
    initialPeriod,
    scope: activeTab === "details" ? "details" : "stream",
    ...(effectiveTimeZone != null ? { timeZone: effectiveTimeZone } : {}),
  });

  const advancedFilters = filterParams;
  const activeTabQueryState = useMemo(
    () => getActiveTabQueryState(ledgerId, activeTab, activeFeatureStatus, tabQueryReport),
    [activeFeatureStatus, activeTab, ledgerId, tabQueryReport]
  );
  const retryActiveTab = useCallback(() => {
    retryFeatureMessages();
    if (
      tabQueryReport?.ledgerId === ledgerId &&
      tabQueryReport.tab === activeTab &&
      tabQueryReport.queryKey.length > 0
    ) {
      void queryClient.refetchQueries({ queryKey: tabQueryReport.queryKey, exact: true });
    }
  }, [activeTab, ledgerId, queryClient, retryFeatureMessages, tabQueryReport]);
  const refreshActiveTab = useCallback(async () => {
    const matchesActiveTab = (query: { queryKey: readonly unknown[] }) => {
      const key = query.queryKey;
      if (activeTab === "stream") {
        return (
          key[0] === "sourceDocuments" &&
          key[1] === ledgerId &&
          (key[2] === "stream" || key[2] === "streamTotal")
        );
      }
      if (activeTab === "details") {
        return (key[0] === "ledgerEntries" || key[0] === "summary") && key[1] === ledgerId;
      }
      if (activeTab === "stats") return key[0] === "enhanced-stats" && key[1] === ledgerId;
      return (
        (key[0] === "ledger" || key[0] === "entryCategories" || key[0] === "ledgerSettings") &&
        key[1] === ledgerId
      );
    };
    await queryClient.refetchQueries(
      { predicate: matchesActiveTab, type: "active" },
      { throwOnError: true }
    );
  }, [activeTab, ledgerId, queryClient]);
  const { handleCategoryDrilldown, handleDateDrilldown } = useDrilldownNavigation({
    searchParams,
    pathname,
    ledgerId,
  });

  const { isInputOpen, setIsInputOpen, inputMode, setInputMode, handleInputDialogChange } =
    useLedgerDialogState();
  const [aiPending, setAiPending] = useState(false);
  const [quickPending, setQuickPending] = useState(false);
  const [aiDirty, setAiDirty] = useState(false);
  const [quickDirty, setQuickDirty] = useState(false);
  const [discardInputOpen, setDiscardInputOpen] = useState(false);
  const isInputSubmitting = aiPending || quickPending;
  const hasInputDraft = aiDirty || quickDirty;
  const setGlobalDirty = useUnsavedChangesStore((state) => state.setDirty);
  const dirtyChangeCount = useUnsavedChangesStore((state) => state.dirtyKeys.size);

  useEffect(() => {
    setGlobalDirty(`new-record:${ledgerId}`, hasInputDraft);
    return () => setGlobalDirty(`new-record:${ledgerId}`, false);
  }, [hasInputDraft, ledgerId, setGlobalDirty]);

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

        <div
          className={activeTabQueryState === "error-empty" ? "hidden" : undefined}
          aria-hidden={activeTabQueryState === "error-empty" ? true : undefined}
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
                  onApplyPreset={applyStreamStatusPreset}
                  onResetFilters={resetFilters}
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
                  onResetFilters={resetFilters}
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
                  {...(initialStatsDate !== undefined ? { initialDate: initialStatsDate } : {})}
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

        <Dialog
          open={isInputOpen}
          onOpenChange={(open) => {
            if (!open && isInputSubmitting) return;
            if (!open && hasInputDraft) {
              setDiscardInputOpen(true);
              return;
            }
            handleInputDialogChange(open);
          }}
        >
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
          open={discardInputOpen}
          onOpenChange={setDiscardInputOpen}
          title={tCommon("unsavedChangesTitle")}
          description={tCommon("unsavedChangesDescription")}
          confirmLabel={tCommon("discard")}
          variant="destructive"
          onConfirm={() => {
            setIsInputOpen(false);
            setAiDirty(false);
            setQuickDirty(false);
          }}
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
