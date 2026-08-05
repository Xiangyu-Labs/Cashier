"use client";
import type { ReactNode } from "react";
import { PullToRefreshSurface } from "@/components/ui/pull-to-refresh";
import { PullToRefreshProvider } from "@/modules/workspace/pull-to-refresh-context";
import { Header } from "./Header";

interface AppShellProps {
  navigation: ReactNode;
  children: ReactNode;
}

export function AppShell({ navigation, children }: AppShellProps) {
  return (
    <PullToRefreshProvider>
      <div className="flex min-h-dvh max-w-full flex-col overflow-x-clip bg-bg text-text">
        <Header navigation={navigation} />
        <main
          data-pull-to-refresh-surface=""
          className="relative z-content mx-auto flex min-h-0 w-full min-w-0 max-w-6xl flex-1 flex-col overflow-x-clip px-3 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-4 md:px-6 md:pb-6"
        >
          <PullToRefreshSurface>{children}</PullToRefreshSurface>
        </main>
        <div className="fixed inset-x-0 bottom-0 z-header h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
          {navigation}
        </div>
      </div>
    </PullToRefreshProvider>
  );
}
