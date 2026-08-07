"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DetailsTabSkeleton,
  EntriesTabSkeleton,
  SettingsTabSkeleton,
  StatsTabSkeleton,
} from "@/components/skeletons/TabSkeletons";
import type { EntryFilters } from "@/modules/ledger/ui/EntryFilterPanel";
import type { LedgerTab } from "@/modules/workspace/tabs";
import { DeferredFeatureMessages } from "@/i18n/DeferredFeatureMessages";
import { useRegisterExternalLoadingActivity } from "@/modules/workspace/pull-to-refresh-context";
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
  const locale = useLocale();
  const [snapshot, setSnapshot] = useState<LedgerStartupCacheSnapshot | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  useRegisterExternalLoadingActivity(queryState === "loading");

  useEffect(() => {
    const toastId = `ledger-startup:${snapshotKey}`;
    if (queryState === "error") {
      toast.error(t("startupCacheError"), {
        id: toastId,
        duration: Infinity,
        action: { label: t("retry"), onClick: onRetry },
      });
    } else {
      toast.dismiss(toastId);
    }
    return () => {
      toast.dismiss(toastId);
    };
  }, [onRetry, queryState, snapshotKey, t]);

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

  const previewFeature =
    activeTab === "stream" || activeTab === "details" || activeTab === "stats" ? activeTab : null;
  const previewContent =
    activeTab === "settings" || loadState !== "ready" || snapshot == null ? (
      <SkeletonForTab activeTab={activeTab} />
    ) : activeTab === "stream" ? (
      <LedgerStartupStreamPreview snapshot={snapshot} initialFilters={initialFilters} />
    ) : activeTab === "details" ? (
      <LedgerStartupDetailsPreview snapshot={snapshot} initialFilters={initialFilters} />
    ) : (
      <LedgerStartupStatsPreview snapshot={snapshot} />
    );

  return previewFeature == null ? (
    previewContent
  ) : (
    <DeferredFeatureMessages
      feature={previewFeature}
      locale={locale}
      fallback={<SkeletonForTab activeTab={activeTab} />}
    >
      {previewContent}
    </DeferredFeatureMessages>
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
