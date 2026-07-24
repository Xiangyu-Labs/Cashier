"use client";
import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import { AppShell } from "@/modules/workspace/ui/AppShell";
import { TabNavigation } from "@/modules/workspace/ui/TabNavigation";
import { useLedgerTabs } from "@/modules/workspace/hooks";
import type { LedgerTab } from "@/modules/workspace/tabs";

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
 * Tab-change and header-interaction callbacks are fully wired here.
 * The header's "+" button and status-preset buttons are no-ops until
 * LedgerPageClient mounts behind the bootstrap Suspense; after that they
 * are patched via React state lifts in the BootstrapContext.
 */
export function ActiveShell({ ledgerId, children }: ActiveShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Derive the active tab from the URL — keeps the shell and the inner
  // content in sync without duplicating state.
  const { activeTab, handleTabChange } = useLedgerTabs({
    searchParams,
    pathname,
  });

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

  // No-op callbacks — the real handlers are wired in LedgerPageClient
  // which mounts behind the bootstrap Suspense boundary.
  const noop = useCallback(() => {}, []);

  return (
    <AppShell
      ledgerId={ledgerId}
      onOpenInput={noop}
      onNeedsAttention={noop}
      onInProgress={noop}
    >
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-4">
        <div className="mx-auto flex w-full max-w-4xl justify-center px-2 md:justify-start md:px-0">
          <TabNavigation
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onTabIntent={preloadTab}
          />
        </div>

        {/*
         * The children are the inner Suspense boundary wrapping
         * ActiveContent -> LedgerPageClient (tab content + dialogs).
         * This allows the shell (header, tabs) to render before
         * the heavy bootstrap queries complete.
         */}
        {children}
      </Tabs>
    </AppShell>
  );
}
