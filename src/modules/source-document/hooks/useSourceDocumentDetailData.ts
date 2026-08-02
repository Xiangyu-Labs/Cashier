"use client";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  getSourceDocumentLightAction,
  getStreamRefreshAction,
} from "@/modules/source-document/actions";
import {
  applyStreamRefreshToCache,
  readLedgerSyncVersion,
} from "@/modules/source-document/hooks/stream-refresh-cache";
import type { StreamRefreshResult } from "@/modules/source-document/contract-refresh";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { isRefreshableRevisionState, useRevisionStateRefresh } from "./revision-state-refresh";
import { applyDetailToStreamCaches } from "./source-document-optimistic-cache";

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
  } = useQuery({
    queryKey: queryKeys.sourceDocument(id),
    queryFn: () => getSourceDocumentLightAction(ledgerId, id),
    enabled: open && id !== "",
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const pending = sourceDocument != null && isRefreshableRevisionState(sourceDocument.status);

  useEffect(() => {
    if (sourceDocument != null) {
      applyDetailToStreamCaches(queryClient, ledgerId, sourceDocument);
    }
  }, [ledgerId, queryClient, sourceDocument]);

  const refreshWatched = async (): Promise<{ changed: boolean; result?: StreamRefreshResult }> => {
    const result = await getStreamRefreshAction(ledgerId, {
      ledgerId,
      afterVersion: readLedgerSyncVersion(ledgerId),
    });

    applyStreamRefreshToCache(queryClient, ledgerId, result);
    return { changed: result.changed, result };
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
