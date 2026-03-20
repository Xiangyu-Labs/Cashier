"use client";

import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
} from "@/lib/query-keys";
import type { EntryEditData } from "@/modules/source-document/ui/entry-edit-data";
import { useSourceDocumentEntryMutations } from "./useSourceDocumentEntryMutations";
import { useSourceDocumentRecordMutations } from "./useSourceDocumentRecordMutations";
import type { BatchEntryUpdateData } from "./source-document-detail-cache";

interface UseSourceDocumentDetailMutationsOptions {
  id: string;
  ledgerId: string | undefined;
  onClose: () => void;
}

type QueryPredicate = (query: { queryKey: readonly unknown[] }) => boolean;

interface SourceDocumentMutationPredicates {
  sourceDocumentPredicates: QueryPredicate[] | null;
  sourceDocumentSummaryPredicates: QueryPredicate[] | null;
  sourceDocumentAndEntriesPredicates: QueryPredicate[] | null;
  sourceDocumentEntriesSummaryPredicates: QueryPredicate[] | null;
}

function buildPredicates(ledgerId: string | undefined): SourceDocumentMutationPredicates {
  const hasLedgerId = ledgerId != null && ledgerId !== "";

  return {
    sourceDocumentPredicates: hasLedgerId ? [invalidateSourceDocuments(ledgerId)] : null,
    sourceDocumentSummaryPredicates: hasLedgerId
      ? [
          invalidateSourceDocuments(ledgerId),
          invalidateLedgerStats(ledgerId),
          invalidateCalendar(ledgerId),
        ]
      : null,
    sourceDocumentAndEntriesPredicates: hasLedgerId
      ? [invalidateSourceDocuments(ledgerId), invalidateLedgerEntries(ledgerId)]
      : null,
    sourceDocumentEntriesSummaryPredicates: hasLedgerId
      ? [
          invalidateSourceDocuments(ledgerId),
          invalidateLedgerEntries(ledgerId),
          invalidateLedgerStats(ledgerId),
          invalidateCalendar(ledgerId),
        ]
      : null,
  };
}

export function useSourceDocumentDetailMutations({
  id,
  ledgerId,
  onClose,
}: UseSourceDocumentDetailMutationsOptions) {
  const predicates = buildPredicates(ledgerId);

  const { updateSourceDocMutation, updateSourceDocImagesMutation, deleteDocumentMutation } =
    useSourceDocumentRecordMutations({
      id,
      ledgerId,
      onClose,
      sourceDocumentPredicates: predicates.sourceDocumentPredicates,
      sourceDocumentSummaryPredicates: predicates.sourceDocumentSummaryPredicates,
      sourceDocumentEntriesSummaryPredicates: predicates.sourceDocumentEntriesSummaryPredicates,
    });

  const { updateEntryMutation, batchUpdateMutation, deleteEntryMutation, batchDeleteMutation } =
    useSourceDocumentEntryMutations({
      id,
      ledgerId,
      sourceDocumentAndEntriesPredicates: predicates.sourceDocumentAndEntriesPredicates,
      sourceDocumentEntriesSummaryPredicates: predicates.sourceDocumentEntriesSummaryPredicates,
    });

  return {
    updateSourceDoc: async (data: { title?: string; entryDate?: string }) =>
      updateSourceDocMutation.mutateAsync(data),
    updateImages: async (images: { data: string; mimeType: string }[]) =>
      updateSourceDocImagesMutation.mutateAsync({ images }),
    updateEntry: async (entryId: string, data: Partial<EntryEditData>) =>
      updateEntryMutation.mutateAsync({ entryId, data }),
    batchUpdate: async (ids: string[], data: BatchEntryUpdateData) =>
      batchUpdateMutation.mutateAsync({ ids, data }),
    deleteEntry: async (entryId: string) => deleteEntryMutation.mutateAsync(entryId),
    batchDelete: async (ids: string[]) => batchDeleteMutation.mutateAsync(ids),
    deleteDocument: async () => deleteDocumentMutation.mutateAsync(),
  };
}

export type { BatchEntryUpdateData };
