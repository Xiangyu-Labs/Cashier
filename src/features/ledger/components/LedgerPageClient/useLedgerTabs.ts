/**
 * Ledger Tabs Hook
 *
 * Manages active tab state with URL synchronization.
 */

import { useState, useCallback } from "react";

interface UseLedgerTabsOptions {
  initialTab?: string;
  searchParams: URLSearchParams;
  pathname: string;
}

interface UseLedgerTabsResult {
  activeTab: string;
  handleTabChange: (value: string) => void;
}

export function useLedgerTabs({
  initialTab = "history",
  searchParams,
  pathname,
}: UseLedgerTabsOptions): UseLedgerTabsResult {
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") || initialTab);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }, [searchParams, pathname]);

  return {
    activeTab,
    handleTabChange,
  };
}
