"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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
import { RevisionStateRefreshProvider } from "@/modules/source-document/hooks/revision-state-refresh";
import type { InterfaceLanguage } from "@/modules/auth/contracts";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { OfflineSnapshotSync } from "@/modules/offline/OfflineSnapshotSync";
import { useConnectionState } from "@/modules/offline/connection-state";
import { offlineSnapshotKey } from "@/modules/offline/offline-store";

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
const OfflineLedgerView = dynamic(
  () => import("@/modules/offline/OfflineLedgerView").then((module) => module.OfflineLedgerView),
  { ssr: false }
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
    <div aria-hidden className="min-h-[26rem] space-y-4 pt-1">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

const ModalStackRenderer = dynamic(
  () =>
    import("@/components/providers/ModalStackRenderer").then((module) => ({
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
  userId: string;
  initialTab: LedgerTab;
  initialPeriod: PeriodParams;
  initialStatsDate?: Date;
  /** Server-derived user email for the Settings tab (avoids useSession). */
  userEmail?: string;
  hasPassword?: boolean;
  passwordUpdatedAt?: string | null;
  interfaceLanguage?: InterfaceLanguage;
}

const STALE_TIME = LEDGER.STALE_TIME_MS;
const subscribeToDeviceTimeZone = () => () => {};
const getDeviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const getServerTimeZone = () => undefined;

export function LedgerPageClient({ ...props }: LedgerPageClientProps) {
  return (
    <RevisionStateRefreshProvider ledgerId={props.ledgerId}>
      <LedgerPageClientContent {...props} />
    </RevisionStateRefreshProvider>
  );
}

function LedgerPageClientContent({
  ledgerId,
  userId,
  initialTab,
  initialPeriod,
  initialStatsDate,
  userEmail,
  hasPassword,
  passwordUpdatedAt,
  interfaceLanguage,
}: LedgerPageClientProps) {
  const t = useTranslations("LedgerPage");
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { networkStatus: connectionStatus, setSyncStatus } = useConnectionState();
  const offline = connectionStatus === "offline";

  const { data: ledger } = useQuery({
    queryKey: queryKeys.ledger(ledgerId),
    queryFn: () => getLedgerAction(ledgerId),
    staleTime: STALE_TIME,
    enabled: !offline,
  });

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.entryCategories(ledgerId),
    queryFn: () => getEntryCategoriesAction(ledgerId),
    staleTime: STALE_TIME,
    enabled: !offline,
  });

  const { activeTab, handleTabChange: _handleTabChange } = useLedgerTabs({
    initialTab,
    searchParams,
    pathname,
  });

  const mainCurrency = ledger?.metadata?.settings?.mainCurrency ?? "CNY";
  const preferredCurrencies = ledger?.metadata?.settings?.currencies ?? [];
  const fixedTimeZone = ledger?.metadata?.settings?.timeZone ?? undefined;
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
  const { handleCategoryDrilldown, handleDateDrilldown } = useDrilldownNavigation({
    searchParams,
    pathname,
    ledgerId,
  });

  const { isInputOpen, setIsInputOpen, inputMode, setInputMode, handleInputDialogChange } =
    useLedgerDialogState();
  const [isInputSubmitting, setIsInputSubmitting] = useState(false);

  // Wire the real new-record handler into the shell once this component mounts.
  const { setInputIntent, setOpenInput } = useShellController();

  useEffect(() => {
    setOpenInput(() => () => setIsInputOpen(true));
  }, [setOpenInput, setIsInputOpen]);

  useEffect(() => {
    setInputIntent(() => preloadNewRecordModules);
  }, [setInputIntent]);

  if (ledger == null) {
    if (offline) {
      return (
        <OfflineLedgerView
          snapshotKey={offlineSnapshotKey(userId, ledgerId)}
          activeTab={activeTab}
          initialFilters={filters}
          onFiltersChange={handleFiltersChange}
        />
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="text-muted">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <>
      {offline ? (
        <OfflineLedgerView
          snapshotKey={offlineSnapshotKey(userId, ledgerId)}
          activeTab={activeTab}
          initialFilters={filters}
          onFiltersChange={handleFiltersChange}
        />
      ) : (
        <OfflineSnapshotSync
          userId={ledger.userId}
          ledgerId={ledgerId}
          locale={locale}
          mainCurrency={mainCurrency}
          timeZone={fixedTimeZone ?? null}
          collapseEntriesDefault={ledger.metadata?.settings?.collapseEntriesDefault ?? false}
          preferredCurrencies={preferredCurrencies}
          categories={categories}
          onStatusChange={setSyncStatus}
        />
      )}
      <div className={offline ? "hidden" : undefined} aria-hidden={offline || undefined}>
        {/* Only mount the active tab — inactive tabs load lazily */}
        {activeTab === "stream" && (
          <div className="mt-0 min-w-0 max-w-full overflow-x-clip">
            <LedgerEntriesTab
              ledgerId={ledgerId}
              categories={categories.length > 0 ? categories : []}
              ledger={ledger}
              periodParams={periodParams}
              onFiltersChange={handleFiltersChange}
              advancedFilters={advancedFilters}
              collapseEntriesDefault={ledger.metadata?.settings?.collapseEntriesDefault ?? false}
              onApplyPreset={applyStreamStatusPreset}
              onResetFilters={resetFilters}
              {...(effectiveTimeZone != null ? { timeZone: effectiveTimeZone } : {})}
            />
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
              />
            </DeferredFeatureMessages>
          </div>
        )}

        <Dialog
          open={isInputOpen}
          onOpenChange={(open) => {
            if (!open && isInputSubmitting) return;
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
            <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
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

              <div className="min-h-[26rem]">
                {inputMode === "ai" ? (
                  <SourceDocumentInput
                    ledgerId={ledgerId}
                    onPendingChange={setIsInputSubmitting}
                    {...(effectiveTimeZone != null ? { timeZone: effectiveTimeZone } : {})}
                    onSuccess={() => setIsInputOpen(false)}
                  />
                ) : (
                  <QuickEntryForm
                    ledgerId={ledgerId}
                    categories={categories}
                    mainCurrency={mainCurrency}
                    preferredCurrencies={preferredCurrencies}
                    {...(effectiveTimeZone != null ? { timeZone: effectiveTimeZone } : {})}
                    onSuccess={() => setIsInputOpen(false)}
                  />
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <ModalStackRenderer categories={categories} />
      </div>
    </>
  );
}
