"use client";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  getSourceDocumentByIdAction,
  getSourceDocumentLightAction,
} from "@/modules/source-document/actions";
import type { LedgerEntry } from "@/modules/ledger/contracts";

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
  const { data: lightData, isLoading: isLoadingLight } = useQuery({
    queryKey: queryKeys.sourceDocumentLight(id),
    queryFn: () => getSourceDocumentLightAction(ledgerId, id),
    enabled: open && id !== "",
    staleTime: 5 * 60 * 1000,
  });

  const { data: fullData, error } = useQuery({
    queryKey: queryKeys.sourceDocument(id),
    queryFn: () => getSourceDocumentByIdAction(id),
    enabled: open && id !== "",
    retry: false,
  });

  const sourceDocument = fullData ?? lightData ?? null;
  const isLoading = isLoadingLight && lightData == null;
  const currentLedgerEntries = sourceDocument?.ledgerEntries ?? initialLedgerEntries ?? [];
  const isLoadingImages =
    sourceDocument != null &&
    sourceDocument.hasImages === true &&
    (sourceDocument.imageUrls?.length ?? 0) === 0;

  return {
    sourceDocument,
    currentLedgerEntries,
    ledgerId: sourceDocument?.ledgerId ?? ledgerId,
    isLoading,
    isLoadingImages,
    error,
  };
}
