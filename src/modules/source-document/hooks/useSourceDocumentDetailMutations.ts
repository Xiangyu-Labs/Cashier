"use client";

import { useTranslations } from "next-intl";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocumentCounts,
  invalidateSourceDocumentStream,
  invalidateSourceDocumentStreamTotal,
  invalidateSourceDocuments,
  queryKeys,
} from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  saveSourceDocumentChangesAction,
  splitSourceDocumentAction,
} from "@/modules/source-document/actions";
import {
  createLedgerEntryAction,
  deleteLedgerEntryAction,
} from "@/modules/ledger/server-actions/entries";
import type { SplitSourceDocumentInput } from "@/modules/source-document/contracts";
import type { PendingChanges } from "./usePendingChanges";
import { applySourceDocumentReconciliation } from "./source-document-optimistic-cache";
import { useSourceDocumentEntryMutations } from "./useSourceDocumentEntryMutations";
import { useSourceDocumentRecordMutations } from "./useSourceDocumentRecordMutations";
import type { BatchEntryUpdateData } from "./source-document-detail-cache";
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
  expectedRevisionId: string;
  operationId: string;
  changes: PendingChanges;
}

/** Fields collected by the "add entry" dialog for a new ledger entry. */
export interface AddEntryData {
  itemName: string;
  amount: number;
  currency?: string;
  categoryId?: string;
  description?: string | null;
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

  const saveChangesMutation = useLedgerMutation(ledgerId, {
    mutationFn: async ({ expectedRevisionId, operationId, changes }: SaveDetailChanges) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      return saveSourceDocumentChangesAction(ledgerId, {
        sourceDocumentId: id,
        expectedRevisionId,
        operationId,
        ...(Object.keys(changes.sourceDoc).length === 0
          ? {}
          : { sourceDocument: changes.sourceDoc }),
        entries: Object.entries(changes.entries).map(([ledgerEntryId, data]) => ({
          ledgerEntryId,
          data,
        })),
      });
    },
    successMessage: null,
    errorMessage: null,
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    refreshFailureMode: "log-only",
    ...(predicates.sourceDocumentAndEntriesPredicates == null
      ? {}
      : { cancelPredicates: predicates.sourceDocumentAndEntriesPredicates }),
    ...(predicates.detailWritePredicates == null
      ? {}
      : { invalidatePredicates: predicates.detailWritePredicates }),
    onSuccessReconcile: (queryClient, result) => {
      if (ledgerId == null || ledgerId === "") return;
      queryClient.setQueryData(queryKeys.sourceDocument(ledgerId, id), result.sourceDocument);
      queryClient.setQueryData(queryKeys.sourceDocumentLight(ledgerId, id), result.sourceDocument);
    },
    onWriteSuccess: notifyRefresh,
  });

  const splitMutation = useLedgerMutation(ledgerId, {
    mutationFn: async (input: Omit<SplitSourceDocumentInput, "sourceDocumentId">) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      return splitSourceDocumentAction(ledgerId, { sourceDocumentId: id, ...input });
    },
    successMessage: null,
    errorMessage: null,
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    refreshFailureMode: "log-only",
    mutationReason: "batch",
    ...(predicates.detailWritePredicates == null
      ? {}
      : {
          cancelPredicates: predicates.detailWritePredicates,
          invalidatePredicates: [
            ...predicates.detailWritePredicates,
            ...(ledgerId == null || ledgerId === ""
              ? []
              : [
                  invalidateSourceDocumentStream(ledgerId),
                  invalidateSourceDocumentStreamTotal(ledgerId),
                ]),
          ],
        }),
    onSuccessReconcile: (queryClient, result) => {
      if (ledgerId == null || ledgerId === "") return;
      queryClient.setQueryData(queryKeys.sourceDocument(ledgerId, id), result.sourceDocument);
      queryClient.setQueryData(queryKeys.sourceDocumentLight(ledgerId, id), result.sourceDocument);
      queryClient.setQueryData(
        queryKeys.sourceDocument(ledgerId, result.splitSourceDocumentId),
        result.splitSourceDocument
      );
      queryClient.setQueryData(
        queryKeys.sourceDocumentLight(ledgerId, result.splitSourceDocumentId),
        result.splitSourceDocument
      );
    },
    onWriteSuccess: notifyRefresh,
  });

  const addEntryMutation = useLedgerMutation(ledgerId, {
    mutationFn: async (data: AddEntryData) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      const operationId = crypto.randomUUID();
      return createLedgerEntryAction(ledgerId, { sourceDocumentId: id, ...data }, operationId);
    },
    successMessage: null,
    errorMessage: null,
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    refreshFailureMode: "log-only",
    mutationReason: "create",
    ...(predicates.detailWritePredicates == null
      ? {}
      : {
          cancelPredicates: predicates.detailWritePredicates,
          invalidatePredicates: [
            ...predicates.detailWritePredicates,
            ...(ledgerId == null || ledgerId === ""
              ? []
              : [
                  invalidateSourceDocumentStream(ledgerId),
                  invalidateSourceDocumentStreamTotal(ledgerId),
                ]),
          ],
        }),
    onSuccessReconcile: (queryClient, result) => {
      if (ledgerId == null || ledgerId === "") return;
      applySourceDocumentReconciliation(queryClient, ledgerId, id, result.reconciliation);
    },
    onWriteSuccess: notifyRefresh,
  });

  const deleteEntryMutation = useLedgerMutation(ledgerId, {
    mutationFn: async (entryId: string) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      const operationId = crypto.randomUUID();
      return deleteLedgerEntryAction(ledgerId, entryId, operationId);
    },
    successMessage: null,
    errorMessage: null,
    refreshFailureMessage: tCommon("savedRefreshFailed"),
    refreshFailureMode: "log-only",
    mutationReason: "delete",
    ...(predicates.detailWritePredicates == null
      ? {}
      : {
          cancelPredicates: predicates.detailWritePredicates,
          invalidatePredicates: [
            ...predicates.detailWritePredicates,
            ...(ledgerId == null || ledgerId === ""
              ? []
              : [
                  invalidateSourceDocumentStream(ledgerId),
                  invalidateSourceDocumentStreamTotal(ledgerId),
                ]),
          ],
        }),
    onSuccessReconcile: (queryClient, result) => {
      if (ledgerId == null || ledgerId === "") return;
      if (result.sourceDocumentId != null) {
        applySourceDocumentReconciliation(
          queryClient,
          ledgerId,
          result.sourceDocumentId,
          result.reconciliation
        );
      }
    },
    onWriteSuccess: notifyRefresh,
  });

  return {
    saveChanges: (input: SaveDetailChanges) => saveChangesMutation.mutateAsync(input),
    splitEntries: (input: Omit<SplitSourceDocumentInput, "sourceDocumentId">) =>
      splitMutation.mutateAsync(input),
    addEntry: (data: AddEntryData) => addEntryMutation.mutateAsync(data),
    deleteEntry: (entryId: string) => deleteEntryMutation.mutateAsync(entryId),
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
    isSavingChanges: saveChangesMutation.isPending,
    isSplitting: splitMutation.isPending,
  };
}

export type { BatchEntryUpdateData };
