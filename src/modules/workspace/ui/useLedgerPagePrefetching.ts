"use client";
import { useEffect } from "react";
import { type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { LEDGER } from "@/lib/constants";
import { fireAndForget } from "@/lib/safe-async";
import { getLedgerAction } from "@/modules/ledger/actions";

const INPUT_PREFETCH_DELAY = 2000;

interface UseLedgerPagePrefetchingOptions {
  isInputOpen: boolean;
  ledgerId: string;
  queryClient: QueryClient;
}

export function useLedgerPagePrefetching({
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
}
