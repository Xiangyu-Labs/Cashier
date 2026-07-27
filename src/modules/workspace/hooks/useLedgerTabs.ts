"use client";
import { useCallback, useMemo } from "react";
import { updateLedgerSearchParams } from "../ledger-url-params";
import { replaceLedgerUrl } from "../ledger-url-navigation";
import { parseLedgerTab, type LedgerTab } from "@/modules/workspace/tabs";

interface UseLedgerTabsOptions {
  initialTab?: LedgerTab;
  searchParams: URLSearchParams;
  pathname: string;
}

interface UseLedgerTabsResult {
  activeTab: LedgerTab;
  handleTabChange: (value: string) => void;
}

export function useLedgerTabs({
  initialTab = "stream",
  searchParams,
  pathname,
}: UseLedgerTabsOptions): UseLedgerTabsResult {
  const activeTab = useMemo(
    () => parseLedgerTab(searchParams, initialTab),
    [searchParams, initialTab]
  );

  const handleTabChange = useCallback(
    (value: string) => {
      const scope = activeTab === "stream" || activeTab === "details" ? activeTab : undefined;
      const params = updateLedgerSearchParams(searchParams, { tab: value }, scope);
      replaceLedgerUrl(pathname, params);
    },
    [activeTab, searchParams, pathname]
  );

  return {
    activeTab,
    handleTabChange,
  };
}
