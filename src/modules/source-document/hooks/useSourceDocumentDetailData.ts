"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getSourceDocumentLightAction, getStreamRefreshAction } from "@/modules/source-document/actions";
import { applyStreamRefreshToCache } from "@/modules/source-document/hooks/stream-refresh-cache";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { isRefreshableRevisionState, useRevisionStateRefresh } from "./revision-state-refresh";

interface UseSourceDocumentDetailDataOptions {
  ledgerId: string;
  id: string;
  open: boolean;
  initialLedgerEntries?: LedgerEntry[];
}

export function useSourceDocumentDetailData({
  ledgerId,
  id,
  open,
  initialLedgerEntries,
}: UseSourceDocumentDetailDataOptions) {
  const queryClient = useQueryClient();

  const {
    data: sourceDocument,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.sourceDocument(id),
    queryFn: () => getSourceDocumentLightAction(ledgerId, id),
    enabled: open && id !== "",
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const pending =
    sourceDocument != null && isRefreshableRevisionState(sourceDocument.status);

  // Register this document as "watched" for bounded refresh
  const refreshWatched = async (): Promise<{ changed: boolean }> => {
    try {
      const result = await getStreamRefreshAction(ledgerId, {
        ledgerId,
        protocolVersion: 1,
        signatures: [],
        watchedIds: [id],
        countFingerprint: null,
      });

      applyStreamRefreshToCache(queryClient, ledgerId, result);
      return { changed: result.changed };
    } catch {
      return { changed: false };
    }
  };

  useRevisionStateRefresh({
    scope: `source-document-detail:${id}`,
    enabled: open && id !== "",
    pending,
    refresh: refreshWatched,
  });

  const currentLedgerEntries = sourceDocument?.ledgerEntries ?? initialLedgerEntries ?? [];
  const isLoadingImages =
    sourceDocument != null &&
    sourceDocument.hasImages === true &&
    sourceDocument.files.length === 0;

  return {
    sourceDocument: sourceDocument ?? null,
    currentLedgerEntries,
    ledgerId: sourceDocument?.ledgerId ?? ledgerId,
    isLoading,
    isLoadingImages,
    error,
  };
}
