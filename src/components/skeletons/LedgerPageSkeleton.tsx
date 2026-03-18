import type { ReactNode } from "react";
import type { LedgerTab } from "@/features/ledger/lib/tabs";
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
      <header className="bg-surface border-b border-border sticky top-0 z-header">
        <div className="w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto px-4 h-14 flex justify-between items-center">
          <div className="flex items-center gap-2">
            {/* Ledger switcher skeleton */}
            <div className="h-8 w-24 bg-surface2 rounded-lg animate-pulse" />
            {/* Task queue button skeleton */}
            <div className="h-8 w-8 bg-surface2 rounded-full animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            {/* Add button skeleton */}
            <div className="h-8 w-8 bg-primary/20 rounded-full animate-pulse" />
          </div>
        </div>
      </header>

      <main className="w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto p-4">
        {/* Tabs skeleton - matches actual TabsList */}
        <div className="w-full grid grid-cols-4 gap-1 bg-surface2 p-1 rounded-lg mb-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 bg-surface rounded animate-pulse" />
          ))}
        </div>

        {contentByTab[activeTab]}
      </main>
    </div>
  );
}
