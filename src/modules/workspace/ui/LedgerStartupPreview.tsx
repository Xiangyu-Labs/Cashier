"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "next-intl";
import {
  DetailsTabSkeleton,
  EntriesTabSkeleton,
  SettingsTabSkeleton,
  StatsTabSkeleton,
} from "@/components/skeletons/TabSkeletons";
import type { EntryFilters } from "@/modules/ledger/ui";
import type { LedgerTab } from "@/modules/workspace/tabs";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  readLedgerStartupSnapshot,
  type LedgerStartupCacheSnapshot,
} from "@/modules/workspace/ledger-startup-cache-store";

const LedgerStartupStreamPreview = dynamic(
  () =>
    import("@/modules/workspace/ui/LedgerStartupStreamPreview").then(
      (module) => module.LedgerStartupStreamPreview
    ),
  { loading: () => <EntriesTabSkeleton />, ssr: false }
);

const LedgerStartupDetailsPreview = dynamic(
  () =>
    import("@/modules/workspace/ui/LedgerStartupDetailsPreview").then(
      (module) => module.LedgerStartupDetailsPreview
    ),
  { loading: () => <DetailsTabSkeleton />, ssr: false }
);

const LedgerStartupStatsPreview = dynamic(
  () =>
    import("@/modules/workspace/ui/LedgerStartupStatsPreview").then(
      (module) => module.LedgerStartupStatsPreview
    ),
  { loading: () => <StatsTabSkeleton />, ssr: false }
);

type LoadState = "loading" | "ready" | "no-cache" | "empty" | "error";

interface LedgerStartupPreviewProps {
  snapshotKey: string;
  activeTab: LedgerTab;
  initialFilters?: EntryFilters;
}

/**
 * Suspense fallback that always attempts to show the startup preview cache.
 * Server data replaces it as soon as the bootstrap finishes; cache misses
 * fall back to the regular skeletons.
 */
export function LedgerStartupPreview({
  snapshotKey,
  activeTab,
  initialFilters = {},
}: LedgerStartupPreviewProps) {
  const locale = useLocale();
  const reducedMotion = useReducedMotion();
  const [snapshot, setSnapshot] = useState<LedgerStartupCacheSnapshot | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  useEffect(() => {
    if (activeTab === "settings") return;
    let disposed = false;
    const load = async () => {
      setLoadState("loading");
      try {
        const next = await readLedgerStartupSnapshot(snapshotKey);
        if (disposed) return;
        setSnapshot(next);
        setLoadState(next == null ? "no-cache" : next.items.length === 0 ? "empty" : "ready");
      } catch {
        if (!disposed) setLoadState("error");
      }
    };
    const onSnapshot = (event: Event) => {
      if ((event as CustomEvent<string>).detail === snapshotKey) void load();
    };
    void load();
    window.addEventListener("cashier:ledger-startup-cache", onSnapshot);
    return () => {
      disposed = true;
      window.removeEventListener("cashier:ledger-startup-cache", onSnapshot);
    };
  }, [activeTab, snapshotKey]);

  if (activeTab === "settings") {
    return <SettingsTabSkeleton />;
  }
  if (loadState !== "ready" || snapshot == null) {
    return <SkeletonForTab activeTab={activeTab} />;
  }

  return (
    <>
      <div
        role="status"
        data-testid="startup-preview-latest-banner"
        className="mx-2 mb-2 flex items-center gap-2 rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-xs text-text"
      >
        <span
          aria-hidden
          className={
            reducedMotion
              ? "size-3 rounded-full bg-info"
              : "size-3 animate-spin rounded-full border-2 border-info/25 border-t-info"
          }
        />
        {locale.startsWith("zh") ? "正在加载最新数据" : "Loading latest data"}
      </div>
      {activeTab === "stream" ? (
        <LedgerStartupStreamPreview snapshot={snapshot} initialFilters={initialFilters} />
      ) : activeTab === "details" ? (
        <LedgerStartupDetailsPreview snapshot={snapshot} initialFilters={initialFilters} />
      ) : (
        <LedgerStartupStatsPreview snapshot={snapshot} />
      )}
    </>
  );
}

function SkeletonForTab({ activeTab }: { activeTab: LedgerTab }) {
  switch (activeTab) {
    case "details":
      return <DetailsTabSkeleton />;
    case "stats":
      return <StatsTabSkeleton />;
    default:
      return <EntriesTabSkeleton />;
  }
}
