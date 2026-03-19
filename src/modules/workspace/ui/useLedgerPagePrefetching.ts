"use client";

import { useEffect } from "react";
import { type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { LEDGER } from "@/lib/constants";
import { fireAndForget } from "@/lib/safe-async";
import { getLedgerAction } from "@/modules/ledger/actions";
import type { LedgerTab } from "@/modules/workspace/tabs";

const INPUT_PREFETCH_DELAY = 2000;

interface UseLedgerPagePrefetchingOptions {
  activeTab: LedgerTab;
  isInputOpen: boolean;
  ledgerId: string;
  queryClient: QueryClient;
}

export function useLedgerPagePrefetching({
  activeTab,
  isInputOpen,
  ledgerId,
  queryClient,
}: UseLedgerPagePrefetchingOptions) {
  useEffect(() => {
    if (!isInputOpen && ledgerId !== "") {
      const timer = setTimeout(() => {
        const cached = queryClient.getQueryData(queryKeys.ledger(ledgerId));
        if (cached === undefined) {
          fireAndForget(
            queryClient.prefetchQuery({
              queryKey: queryKeys.ledger(ledgerId),
              queryFn: () => getLedgerAction(ledgerId),
              staleTime: LEDGER.STALE_TIME_MS,
            }),
            { context: "LedgerPageClient.prefetch" }
          );
        }
      }, INPUT_PREFETCH_DELAY);

      return () => clearTimeout(timer);
    }
  }, [isInputOpen, ledgerId, queryClient]);

  useEffect(() => {
    const preloadTabs = () => {
      if (activeTab !== "details") {
        fireAndForget(import("@/features/ledger/components/DetailsTab"), {
          context: "LedgerPageClient.preload",
        });
      }
      if (activeTab !== "stats") {
        fireAndForget(import("@/features/ledger/components/StatsTab"), {
          context: "LedgerPageClient.preload",
        });
      }
      if (activeTab !== "settings") {
        fireAndForget(import("@/modules/ledger/ui/SettingsTab"), {
          context: "LedgerPageClient.preload",
        });
      }
      if (activeTab !== "stream") {
        fireAndForget(import("@/features/ledger/components/LedgerEntriesTab"), {
          context: "LedgerPageClient.preload",
        });
      }
    };

    const timer = setTimeout(preloadTabs, 500);
    return () => clearTimeout(timer);
  }, [activeTab]);
}
