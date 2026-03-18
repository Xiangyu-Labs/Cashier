"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  getSourceDocumentByIdAction,
  getSourceDocumentLightAction,
} from "@/features/source-document/server-actions";
import type { LedgerEntry, SourceDocument, SourceDocumentLight } from "@/types/api";

interface UseSourceDocumentDetailDataOptions {
  id: string;
  open: boolean;
  initialLedgerEntries?: LedgerEntry[];
}

export function useSourceDocumentDetailData({
  id,
  open,
  initialLedgerEntries,
}: UseSourceDocumentDetailDataOptions) {
  const { data: lightData, isLoading: isLoadingLight } = useQuery({
    queryKey: queryKeys.sourceDocumentLight(id),
    queryFn: () => getSourceDocumentLightAction(id),
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
  const isLoadingImages = fullData?.imageUrls == null;
  const ledgerId = sourceDocument?.ledgerId;
  const currentLedgerEntries = sourceDocument?.ledgerEntries ?? initialLedgerEntries ?? [];
  const safeLedgerId = ledgerId ?? "";
  const safeSourceDocument: (SourceDocument | SourceDocumentLight) | null = sourceDocument
    ? {
        ...sourceDocument,
        status: sourceDocument.status ?? "queued",
        type: sourceDocument.type ?? "",
      }
    : null;

  return {
    sourceDocument,
    safeSourceDocument,
    currentLedgerEntries,
    ledgerId,
    safeLedgerId,
    isLoading,
    isLoadingImages,
    error,
  };
}
