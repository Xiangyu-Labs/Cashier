import type { ReactNode } from "react";
import type { LedgerTab } from "@/lib/ledger-tabs";
import {
  DetailsTabSkeleton,
  EntriesTabSkeleton,
  SettingsTabSkeleton,
  StatsTabSkeleton,
} from "./TabSkeletons";

/**
 * Skeleton component for the main ledger page
 * Shows immediately while server-side data is loading
 */
export function LedgerPageSkeleton({ activeTab = "stream" }: { activeTab?: LedgerTab }) {
  const contentByTab: Record<LedgerTab, ReactNode> = {
    stream: <EntriesTabSkeleton />,
    details: <DetailsTabSkeleton />,
    stats: <StatsTabSkeleton />,
    settings: <SettingsTabSkeleton />,
  };

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header skeleton */}
      <header className="sticky top-0 z-header border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-3 sm:px-4 md:px-6">
          <div className="h-4 w-16 animate-pulse rounded bg-surface2" />
          <div className="h-9 w-9 animate-pulse rounded-md bg-primary/20" />
        </div>
      </header>

      <main className="relative z-content w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto p-4">
        {/* Header navigation skeleton - includes the centered new-record action */}
        <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem_minmax(0,1fr)_minmax(0,1fr)] gap-1 rounded-lg bg-surface2 p-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="min-h-11 rounded-md bg-surface animate-pulse" />
          ))}
        </div>

        {contentByTab[activeTab]}
      </main>
    </div>
  );
}
