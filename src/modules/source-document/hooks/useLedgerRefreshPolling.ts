"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getStreamRefreshAction } from "@/modules/source-document/actions";
import type { LedgerRefreshResult } from "@/modules/source-document/contract-refresh";
import { queryKeys } from "@/lib/query-keys";
import { withQueryTimeout } from "@/lib/query-timeout";
import { applyStreamRefreshToCache } from "./stream-refresh-cache";

const REFRESH_INTERVAL_MS = 3_000;
const REFRESH_TIMEOUT_MS = 15_000;

export function useLedgerRefreshPolling(ledgerId: string, enabled = true) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.sourceDocumentRefresh(ledgerId);

  return useQuery({
    queryKey,
    queryFn: async (): Promise<LedgerRefreshResult> => {
      const previous = queryClient.getQueryData<LedgerRefreshResult>(queryKey);
      const result = await withQueryTimeout(
        getStreamRefreshAction(ledgerId, { afterVersion: previous?.version ?? "0" }),
        REFRESH_TIMEOUT_MS
      );
      await applyStreamRefreshToCache(queryClient, ledgerId, result);
      return result;
    },
    enabled,
    retry: false,
    refetchInterval: (query) =>
      query.state.status === "error" || query.state.data?.hasTransitionalWork === true
        ? REFRESH_INTERVAL_MS
        : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
