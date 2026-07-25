"use client";
import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import { AppShell } from "@/modules/workspace/ui/AppShell";
import { TabNavigation } from "@/modules/workspace/ui/TabNavigation";
import { useLedgerTabs } from "@/modules/workspace/hooks";
import { ShellControllerProvider, useShellController } from "./shell-controller";
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
 * ShellControllerProvider is placed here so both the AppShell (child of
 * the provider) and the LedgerPageClient (deep in children) can access
 * the same context. The header's "+" button and status-preset buttons
 * start as no-ops; LedgerPageClient registers the real handlers via
 * setOpenInput/setNeedsAttention/setInProgress once it mounts.
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
  const { onOpenInput, onNeedsAttention, onInProgress } = useShellController();

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

  return (
    <AppShell
      ledgerId={ledgerId}
      onOpenInput={onOpenInput}
      onNeedsAttention={onNeedsAttention}
      onInProgress={onInProgress}
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
