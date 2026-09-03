"use client";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getSourceDocumentLightAction } from "@/modules/source-document/actions";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { QUERY } from "@/lib/constants";
import { withQueryTimeout } from "@/lib/query-timeout";
import { useLedgerRefreshPolling } from "./useLedgerRefreshPolling";

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

  useLedgerRefreshPolling(ledgerId, open && id !== "");

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
