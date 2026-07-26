"use client";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
} from "@/lib/query-keys";
import type { EntryEditData } from "@/modules/source-document/types";
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
          invalidateLedgerEntries(ledgerId),
          invalidateLedgerStats(ledgerId),
          invalidateCalendar(ledgerId),
        ]
      : null,
    sourceDocumentAndEntriesPredicates: hasLedgerId
      ? [invalidateSourceDocuments(ledgerId), invalidateLedgerEntries(ledgerId)]
      : null,
    sourceDocumentEntriesSummaryPredicates: hasLedgerId
      ? [
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

  const { updateSourceDocMutation, deleteDocumentMutation } = useSourceDocumentRecordMutations({
    id,
    ledgerId,
    onClose,
    sourceDocumentPredicates: predicates.sourceDocumentPredicates,
    sourceDocumentSummaryPredicates: predicates.sourceDocumentSummaryPredicates,
    sourceDocumentEntriesSummaryPredicates: predicates.sourceDocumentEntriesSummaryPredicates,
  });

  const { updateEntryMutation, batchUpdateMutation, deleteEntryMutation } =
    useSourceDocumentEntryMutations({
      id,
      ledgerId,
      sourceDocumentAndEntriesPredicates: predicates.sourceDocumentAndEntriesPredicates,
      sourceDocumentEntriesSummaryPredicates: predicates.sourceDocumentEntriesSummaryPredicates,
    });

  return {
    updateSourceDoc: async (data: { title?: string; entryDate?: string }) => {
      const operationId = crypto.randomUUID();
      await updateSourceDocMutation.mutateAsync({ data, operationId });
    },
    updateEntry: async (entryId: string, data: Partial<EntryEditData>) =>
      updateEntryMutation.mutateAsync({ entryId, data }),
    batchUpdate: async (ids: string[], data: BatchEntryUpdateData) =>
      batchUpdateMutation.mutateAsync({ ids, data }),
    deleteEntry: async (entryId: string) => deleteEntryMutation.mutateAsync(entryId),
    deleteDocument: async () => {
      const operationId = crypto.randomUUID();
      await deleteDocumentMutation.mutateAsync({ operationId });
    },
  };
}

export type { BatchEntryUpdateData };
