"use client";

import { useCallback, useMemo } from "react";
import { updateLedgerSearchParams } from "@/modules/workspace/ledger-url-params";
import { replaceLedgerUrl } from "@/modules/workspace/ledger-url-navigation";
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
      const params = updateLedgerSearchParams(searchParams, { tab: value });
      replaceLedgerUrl(pathname, params);
    },
    [searchParams, pathname]
  );

  return {
    activeTab,
    handleTabChange,
  };
}
