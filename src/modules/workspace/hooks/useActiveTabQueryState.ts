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
            (query.queryKey[0] === "ledgerEntries" || query.queryKey[0] === "summary") &&
            query.queryKey[1] === ledgerId,
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
            query.queryKey[0] === "sourceDocuments" && query.queryKey[1] === ledgerId,
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
            (query.queryKey[0] === "ledger" ||
              query.queryKey[0] === "entryCategories" ||
              query.queryKey[0] === "ledgerSettings") &&
            query.queryKey[1] === ledgerId,
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
          key[0] === "sourceDocuments" &&
          key[1] === ledgerId &&
          (key[2] === "stream" || key[2] === "streamTotal")
        );
      }
      if (activeTab === "details") {
        return (key[0] === "ledgerEntries" || key[0] === "summary") && key[1] === ledgerId;
      }
      if (activeTab === "stats") return key[0] === "enhanced-stats" && key[1] === ledgerId;
      return (
        (key[0] === "ledger" || key[0] === "entryCategories" || key[0] === "ledgerSettings") &&
        key[1] === ledgerId
      );
    };
    await queryClient.refetchQueries(
      { predicate: matchesActiveTab, type: "active" },
      { throwOnError: true }
    );
  }, [activeTab, ledgerId, queryClient]);

  return { activeTabQueryState, retryActiveTab, refreshActiveTab };
}
