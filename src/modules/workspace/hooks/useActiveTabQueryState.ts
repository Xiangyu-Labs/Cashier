"use client";
import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ActiveTabDataState, TabQueryStateReport } from "@/components/tab-query-state";
import type { LedgerTab } from "@/lib/ledger-tabs";

function getActiveTabQueryState(
  ledgerId: string,
  activeTab: LedgerTab,
  featureStatus: "loading" | "success" | "error",
  report: TabQueryStateReport | null
): ActiveTabDataState {
  const matchingReport =
    report != null && report.ledgerId === ledgerId && report.tab === activeTab ? report : null;
  if (featureStatus === "error") {
    return matchingReport?.hasData === true ? "error-with-data" : "error-empty";
  }
  if (featureStatus !== "success" || matchingReport == null) return "initial-loading";
  if (matchingReport.status === "error") {
    return matchingReport.hasData ? "error-with-data" : "error-empty";
  }
  if (matchingReport.status === "pending" || !matchingReport.hasData) return "initial-loading";
  if (matchingReport.isFetching) return "refreshing";
  return "ready";
}

interface UseActiveTabQueryStateOptions {
  ledgerId: string;
  activeTab: LedgerTab;
  activeFeatureStatus: "loading" | "success" | "error";
  tabQueryReport: TabQueryStateReport | null;
  retryFeatureMessages: () => void;
}

/** Derives the active tab's data-readiness state and its retry/refresh actions. */
export function useActiveTabQueryState({
  ledgerId,
  activeTab,
  activeFeatureStatus,
  tabQueryReport,
  retryFeatureMessages,
}: UseActiveTabQueryStateOptions) {
  const queryClient = useQueryClient();

  const activeTabQueryState = useMemo(
    () => getActiveTabQueryState(ledgerId, activeTab, activeFeatureStatus, tabQueryReport),
    [activeFeatureStatus, activeTab, ledgerId, tabQueryReport]
  );

  const retryActiveTab = useCallback(() => {
    retryFeatureMessages();
    if (activeTab === "details") {
      void queryClient.refetchQueries(
        {
          predicate: (query) =>
            query.queryKey[0] === "ledger" &&
            query.queryKey[1] === ledgerId &&
            (query.queryKey[2] === "entries" || query.queryKey[2] === "summary"),
          type: "active",
        },
        { throwOnError: true }
      );
      return;
    }
    if (activeTab === "stream") {
      void queryClient.refetchQueries(
        {
          predicate: (query) =>
            query.queryKey[0] === "ledger" &&
            query.queryKey[1] === ledgerId &&
            query.queryKey[2] === "source-documents",
          type: "active",
        },
        { throwOnError: true }
      );
      return;
    }
    if (activeTab === "settings") {
      void queryClient.refetchQueries(
        {
          predicate: (query) =>
            query.queryKey[0] === "ledger" &&
            query.queryKey[1] === ledgerId &&
            (query.queryKey.length === 2 ||
              query.queryKey[2] === "categories" ||
              query.queryKey[2] === "settings"),
          type: "active",
        },
        { throwOnError: true }
      );
      return;
    }
    if (
      tabQueryReport?.ledgerId === ledgerId &&
      tabQueryReport.tab === activeTab &&
      tabQueryReport.queryKey.length > 0
    ) {
      void queryClient.refetchQueries({ queryKey: tabQueryReport.queryKey, exact: true });
    }
  }, [activeTab, ledgerId, queryClient, retryFeatureMessages, tabQueryReport]);

  const refreshActiveTab = useCallback(async () => {
    const matchesActiveTab = (query: { queryKey: readonly unknown[] }) => {
      const key = query.queryKey;
      if (activeTab === "stream") {
        return (
          key[0] === "ledger" &&
          key[1] === ledgerId &&
          key[2] === "source-documents" &&
          (key[3] === "stream" || key[3] === "stream-total")
        );
      }
      if (activeTab === "details") {
        return (
          key[0] === "ledger" &&
          key[1] === ledgerId &&
          (key[2] === "entries" || key[2] === "summary")
        );
      }
      if (activeTab === "stats") {
        return key[0] === "ledger" && key[1] === ledgerId && key[2] === "enhanced-stats";
      }
      return (
        key[0] === "ledger" &&
        key[1] === ledgerId &&
        (key.length === 2 || key[2] === "categories" || key[2] === "settings")
      );
    };
    await queryClient.refetchQueries(
      { predicate: matchesActiveTab, type: "active" },
      { throwOnError: true }
    );
  }, [activeTab, ledgerId, queryClient]);

  return { activeTabQueryState, retryActiveTab, refreshActiveTab };
}
