"use client";
import { useCallback } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import type { LedgerTab } from "@/lib/ledger-tabs";

/** The shell owns refresh commands, while each tab owns its query presentation. */
export function useActiveTabQueryState({
  ledgerId,
  activeTab,
}: {
  ledgerId: string;
  activeTab: LedgerTab;
}) {
  const queryClient = useQueryClient();
  const matchesActiveTab = useCallback(
    (query: { queryKey: readonly unknown[] }) => {
      const key = query.queryKey;
      if (key[0] !== "ledger" || key[1] !== ledgerId) return false;
      if (activeTab === "stream") {
        return key[2] === "source-documents" && (key[3] === "stream" || key[3] === "stream-total");
      }
      if (activeTab === "details") return key[2] === "entries" || key[2] === "summary";
      if (activeTab === "stats") return key[2] === "enhanced-stats";
      return key.length === 2 || key[2] === "categories" || key[2] === "settings";
    },
    [activeTab, ledgerId]
  );
  const fetchingCount = useIsFetching({ predicate: matchesActiveTab });
  const refreshActiveTab = useCallback(async () => {
    await queryClient.refetchQueries(
      { predicate: matchesActiveTab, type: "active" },
      { throwOnError: true }
    );
  }, [matchesActiveTab, queryClient]);
  return { isRefreshing: fetchingCount > 0, refreshActiveTab };
}
