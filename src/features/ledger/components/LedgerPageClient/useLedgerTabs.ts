/**
 * Ledger Tabs Hook
 *
 * Manages active tab state with URL synchronization.
 */

import { useCallback, useMemo } from "react";

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
  // Single source of truth: URL search params
  // No useState needed - eliminates sync issues with external URL changes
  const activeTab = useMemo(
    () => searchParams.get("tab") || initialTab,
    [searchParams, initialTab]
  );

  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", value);
      window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    },
    [searchParams, pathname]
  );

  return {
    activeTab,
    handleTabChange,
  };
}
