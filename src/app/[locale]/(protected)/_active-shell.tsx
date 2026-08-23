"use client";
import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import { AppShell } from "@/modules/workspace/ui/AppShell";
import { SwipeTabSurface } from "@/modules/workspace/ui/SwipeTabSurface";
import { TabNavigation } from "@/modules/workspace/ui/TabNavigation";
import { useLedgerTabs, useTabScrollRestoration } from "@/modules/workspace/hooks";
import {
  ShellControllerProvider,
  useShellController,
} from "@/components/providers/shell-controller";
import type { LedgerTab } from "@/lib/ledger-tabs";
import { preloadFeatureMessages } from "@/i18n/use-feature-messages";
import { parsePeriodFromSearchParams } from "@/lib/period-utils";
import {
  getScopedLedgerSearchParams,
  readLedgerFilterParams,
  readStatsSearchParams,
} from "@/modules/workspace/ledger-url-params";
import {
  prefetchDetailsTabQuery,
  prefetchStatsTabQuery,
} from "@/modules/workspace/prefetch-ledger-tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSettingsLeaveGuard } from "@/modules/ledger/hooks/useSettingsLeaveGuard";

interface ActiveShellProps {
  ledgerId: string;
  children: React.ReactNode;
}

/**
 * Client-side shell that renders the AppShell, tab navigation, and the
 * active tab content. The shell renders immediately (outside the bootstrap
 * Suspense boundary) so the user sees the header and tabs while the tab
 * content loads behind a nested Suspense.
 *
 * ShellControllerProvider is placed here so both the AppShell (child of
 * the provider) and the LedgerPageClient (deep in children) can access
 * the same context. The header's "+" button and status-preset buttons
 * start as no-ops; LedgerPageClient registers the real handlers via
 * setOpenInput once it mounts.
 */
export function ActiveShell({ ledgerId, children }: ActiveShellProps) {
  return (
    <ShellControllerProvider>
      <ActiveShellInner ledgerId={ledgerId}>{children}</ActiveShellInner>
    </ShellControllerProvider>
  );
}

function ActiveShellInner({ ledgerId, children }: ActiveShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("Common");
  const queryClient = useQueryClient();
  const { onInputIntent, onOpenInput } = useShellController();
  const { leaveConfirmOpen, attemptLeave, confirmLeave, cancelLeave } = useSettingsLeaveGuard();

  // Derive the active tab from the URL — keeps the shell and the inner
  // content in sync without duplicating state.
  const { activeTab, handleTabChange } = useLedgerTabs({
    searchParams,
    pathname,
  });
  useTabScrollRestoration(ledgerId, activeTab);

  const guardedTabChange = useCallback(
    (tab: LedgerTab) => {
      if (tab === activeTab) return;
      attemptLeave(() => handleTabChange(tab));
    },
    [activeTab, attemptLeave, handleTabChange]
  );

  const preloadTabCode = useCallback(
    (tab: LedgerTab) => {
      if (tab === "details") {
        import("@/modules/workspace/ui/DetailsTab");
        void preloadFeatureMessages(locale, "details");
      } else if (tab === "stats") {
        import("@/modules/workspace/ui/StatsTab");
        void preloadFeatureMessages(locale, "stats");
      } else if (tab === "settings") {
        import("@/modules/ledger/ui/SettingsTab");
        void preloadFeatureMessages(locale, "settings");
      }
    },
    [locale]
  );

  const preloadTab = useCallback(
    (tab: LedgerTab) => {
      preloadTabCode(tab);
      if (tab === "details") {
        const scoped = getScopedLedgerSearchParams(searchParams, "details");
        void prefetchDetailsTabQuery(
          queryClient,
          ledgerId,
          parsePeriodFromSearchParams(scoped),
          readLedgerFilterParams(searchParams, "details")
        );
      } else if (tab === "stats") {
        void prefetchStatsTabQuery(queryClient, ledgerId, readStatsSearchParams(searchParams));
      }
    },
    [ledgerId, preloadTabCode, queryClient, searchParams]
  );

  return (
    <AppShell
      navigation={
        <TabNavigation
          activeTab={activeTab}
          onTabChange={guardedTabChange}
          onOpenInput={onOpenInput}
          onInputIntent={onInputIntent}
          onTabIntent={preloadTab}
        />
      }
    >
      <SwipeTabSurface
        activeTab={activeTab}
        onTabChange={guardedTabChange}
        onTabIntent={preloadTab}
      >
        {children}
      </SwipeTabSurface>
      <ConfirmDialog
        open={leaveConfirmOpen}
        onOpenChange={(open) => (open ? undefined : cancelLeave())}
        title={t("unsavedChangesTitle")}
        description={t("unsavedChangesDescription")}
        cancelLabel={t("continueEditing")}
        confirmLabel={t("discardAndContinue")}
        variant="destructive"
        onConfirm={confirmLeave}
      />
    </AppShell>
  );
}
