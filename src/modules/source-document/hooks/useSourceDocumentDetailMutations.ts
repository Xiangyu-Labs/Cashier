"use client";
import { useTranslations } from "next-intl";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocumentCounts,
  invalidateSourceDocuments,
} from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { round } from "@/lib/money/decimal";
import { updateLedgerEntryAction } from "@/modules/ledger/server-actions/entries";
import { updateSourceDocumentAction } from "@/modules/source-document/actions";
import type {
  MutationReconciliation,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";
import type { EntryEditData } from "@/modules/source-document/types";
import { useSourceDocumentEntryMutations } from "./useSourceDocumentEntryMutations";
import { useSourceDocumentRecordMutations } from "./useSourceDocumentRecordMutations";
import type { BatchEntryUpdateData } from "./source-document-detail-cache";
import { applySourceDocumentReconciliation } from "./source-document-optimistic-cache";
import { useNotifyRevisionRefresh } from "./revision-state-refresh";

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
  detailWritePredicates: QueryPredicate[] | null;
}

interface SaveDetailChanges {
  sourceDocument: { title?: string; entryDate?: string };
  entries: Array<{ id: string; data: Partial<EntryEditData> }>;
}

interface SaveDetailResult {
  reconciliation?: MutationReconciliation<SourceDocumentListItemDto>;
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
      ? [invalidateLedgerStats(ledgerId), invalidateCalendar(ledgerId)]
      : null,
    detailWritePredicates: hasLedgerId
      ? [
          invalidateSourceDocuments(ledgerId),
          invalidateLedgerEntries(ledgerId),
          invalidateLedgerStats(ledgerId),
          invalidateCalendar(ledgerId),
          invalidateSourceDocumentCounts(ledgerId),
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
  const tCommon = useTranslations("Common");
  const notifyRefresh = useNotifyRevisionRefresh();

  const { deleteDocumentMutation } = useSourceDocumentRecordMutations({
    id,
    ledgerId,
    onClose,
    sourceDocumentPredicates: predicates.sourceDocumentPredicates,
    sourceDocumentSummaryPredicates: predicates.sourceDocumentSummaryPredicates,
    sourceDocumentEntriesSummaryPredicates: predicates.sourceDocumentEntriesSummaryPredicates,
  });

  const { batchUpdateMutation, batchDeleteMutation } = useSourceDocumentEntryMutations({
    id,
    ledgerId,
    sourceDocumentAndEntriesPredicates: predicates.sourceDocumentAndEntriesPredicates,
    sourceDocumentEntriesSummaryPredicates: predicates.sourceDocumentEntriesSummaryPredicates,
  });

  const saveChangesMutation = useLedgerMutation<SaveDetailResult, SaveDetailChanges>(ledgerId, {
    mutationFn: async ({ sourceDocument, entries }) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");

      let result: SaveDetailResult = {};
      if (Object.keys(sourceDocument).length > 0) {
        result = await updateSourceDocumentAction(
          ledgerId,
          id,
          sourceDocument,
          crypto.randomUUID()
        );
      }

      for (const { id: entryId, data } of entries) {
        await updateLedgerEntryAction(ledgerId, entryId, {
          ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
          ...(data.currency !== undefined ? { currency: data.currency } : {}),
          ...(data.itemName !== undefined ? { itemName: data.itemName } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.amount !== undefined ? { amount: round(data.amount, 2) } : {}),
        });
      }

      return result;
    },
    successMessage: null,
    errorMessage: null,
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    ...(predicates.sourceDocumentAndEntriesPredicates !== null
      ? { cancelPredicates: predicates.sourceDocumentAndEntriesPredicates }
      : {}),
    ...(predicates.detailWritePredicates !== null
      ? { invalidatePredicates: predicates.detailWritePredicates }
      : {}),
    onSuccessReconcile: (client, result) => {
      if (ledgerId == null) return;
      applySourceDocumentReconciliation(client, ledgerId, id, result.reconciliation);
    },
    onSuccessExtra: notifyRefresh,
    onMutationSettled: async (client, _variables, _data, error) => {
      if (error == null || predicates.detailWritePredicates == null) return;
      try {
        await Promise.all(
          predicates.detailWritePredicates.map((predicate) =>
            client.invalidateQueries({ predicate }, { throwOnError: true })
          )
        );
      } catch (refreshError) {
        console.error(
          "Failed to refresh source-document detail after a partial save",
          refreshError
        );
      }
    },
  });

  return {
    saveChanges: async (
      sourceDocument: SaveDetailChanges["sourceDocument"],
      entries: SaveDetailChanges["entries"]
    ) => saveChangesMutation.mutateAsync({ sourceDocument, entries }),
    batchUpdate: async (ids: string[], data: BatchEntryUpdateData) =>
      batchUpdateMutation.mutateAsync({ ids, data }),
    batchDeleteEntries: async (entryIds: string[]) => {
      const result = await batchDeleteMutation.mutateAsync(entryIds);
      return [...result.skipped, ...result.failed].map((item) => item.id);
    },
    deleteDocument: async () => {
      const operationId = crypto.randomUUID();
      await deleteDocumentMutation.mutateAsync({ operationId });
    },
  };
}

export type { BatchEntryUpdateData };
