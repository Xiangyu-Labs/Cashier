"use client";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";
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
  const isLoadingImages = fullData?.imageUrls == null;
  const currentLedgerEntries = sourceDocument?.ledgerEntries ?? initialLedgerEntries ?? [];
  const safeLedgerId = sourceDocument?.ledgerId ?? ledgerId ?? "";
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
    ledgerId: sourceDocument?.ledgerId,
    safeLedgerId,
    isLoading,
    isLoadingImages,
    error,
  };
}
