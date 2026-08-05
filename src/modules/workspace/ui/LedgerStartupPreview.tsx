"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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

type LoadState = "loading" | "ready" | "no-cache" | "error";
export type LedgerStartupQueryState = "loading" | "success" | "error";

interface LedgerStartupPreviewProps {
  snapshotKey: string;
  activeTab: LedgerTab;
  initialFilters?: EntryFilters;
  queryState: LedgerStartupQueryState;
  onRetry: () => void;
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
  queryState,
  onRetry,
}: LedgerStartupPreviewProps) {
  const t = useTranslations("LedgerPage");
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
        setLoadState(next == null ? "no-cache" : "ready");
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

  if (queryState === "success") return null;

  return (
    <>
      <div
        role={queryState === "error" ? "alert" : "status"}
        data-testid="startup-preview-latest-banner"
        aria-live="polite"
        className={`mx-2 mb-2 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
          queryState === "error"
            ? "border-danger/30 bg-danger/10 text-text"
            : "border-info/25 bg-info/10 text-text"
        }`}
      >
        <span
          aria-hidden
          className={
            queryState === "error"
              ? "size-3 rounded-full bg-danger"
              : reducedMotion
                ? "size-3 rounded-full bg-info"
                : "size-3 animate-spin rounded-full border-2 border-info/25 border-t-info"
          }
        />
        <span>{queryState === "error" ? t("startupCacheError") : t("loadingLatest")}</span>
        {snapshot != null && <span className="text-muted">{t("readOnlyPreview")}</span>}
        {queryState === "error" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            onClick={onRetry}
          >
            {t("retry")}
          </Button>
        )}
      </div>
      {activeTab === "settings" || loadState !== "ready" || snapshot == null ? (
        <SkeletonForTab activeTab={activeTab} />
      ) : activeTab === "stream" ? (
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
    case "settings":
      return <SettingsTabSkeleton />;
    case "details":
      return <DetailsTabSkeleton />;
    case "stats":
      return <StatsTabSkeleton />;
    default:
      return <EntriesTabSkeleton />;
  }
}
