"use client";
import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getSourceDocumentLightAction } from "@/modules/source-document/actions";
import type { StreamRefreshResult } from "@/modules/source-document/contract-refresh";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { isRefreshableRevisionState, useRevisionStateRefresh } from "./revision-state-refresh";
import { QUERY } from "@/lib/constants";
import { withQueryTimeout } from "@/lib/query-timeout";
import { drainSourceDocumentDelta } from "./source-document-delta-drain";

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
  const afterVersionRef = useRef("0");

  const query = useQuery({
    queryKey: queryKeys.sourceDocument(ledgerId, id),
    queryFn: () => withQueryTimeout(getSourceDocumentLightAction(ledgerId, id)),
    enabled: open && id !== "",
    staleTime: QUERY.SOURCE_DOC_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const { data: sourceDocument, isLoading, error } = query;

  const pending = sourceDocument != null && isRefreshableRevisionState(sourceDocument.status);

  const refreshWatched = async (): Promise<{ changed: boolean; result?: StreamRefreshResult }> => {
    const drained = await drainSourceDocumentDelta(queryClient, ledgerId, afterVersionRef.current);
    const result = drained.result;
    afterVersionRef.current = result.toVersion;
    return drained;
  };

  useRevisionStateRefresh({
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
    refetch: query.refetch,
  };
}
