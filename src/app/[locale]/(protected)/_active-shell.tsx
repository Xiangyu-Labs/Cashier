"use client";
import { useCallback, useEffect } from "react";
import { useLocale } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import { AppShell } from "@/modules/workspace/ui/AppShell";
import { TabNavigation } from "@/modules/workspace/ui/TabNavigation";
import { useLedgerTabs } from "@/modules/workspace/hooks";
import { ShellControllerProvider, useShellController } from "./shell-controller";
import type { LedgerTab } from "@/modules/workspace/tabs";
import { preloadFeatureMessages } from "@/i18n/use-feature-messages";
import { parsePeriodFromSearchParams } from "@/lib/period-utils";
import {
  getScopedLedgerSearchParams,
  readLedgerFilterParams,
} from "@/modules/workspace/ledger-url-params";
import {
  prefetchDetailsTabQuery,
  prefetchStatsTabQuery,
} from "@/modules/workspace/prefetch-ledger-tabs";

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
  const queryClient = useQueryClient();
  const { onOpenInput } = useShellController();

  // Derive the active tab from the URL — keeps the shell and the inner
  // content in sync without duplicating state.
  const { activeTab, handleTabChange } = useLedgerTabs({
    searchParams,
    pathname,
  });

  const preloadTabCode = useCallback(
    (tab: LedgerTab) => {
      if (tab === "details") {
        import("@/modules/workspace/ui/DetailsTab");
        void preloadFeatureMessages(locale);
      } else if (tab === "stats") {
        import("@/modules/workspace/ui/StatsTab");
        void preloadFeatureMessages(locale);
      } else if (tab === "settings") {
        import("@/modules/ledger/ui/SettingsTab");
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
        void prefetchStatsTabQuery(queryClient, ledgerId);
      }
    },
    [ledgerId, preloadTabCode, queryClient, searchParams]
  );

  useEffect(() => {
    const preload = () => {
      preloadTabCode("details");
      preloadTabCode("stats");
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(preload, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = globalThis.setTimeout(preload, 1500);
    return () => globalThis.clearTimeout(id);
  }, [preloadTabCode]);

  return (
    <AppShell
      navigation={
        <TabNavigation
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onOpenInput={onOpenInput}
          onTabIntent={preloadTab}
        />
      }
    >
      {children}
    </AppShell>
  );
}
