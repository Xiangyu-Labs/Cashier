"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  saveSourceDocumentChangesAction,
  splitSourceDocumentAction,
} from "@/modules/source-document/actions";
import { createLedgerEntryAction, deleteLedgerEntryAction } from "@/modules/ledger/actions";
import type { SplitSourceDocumentInput } from "@/modules/source-document/contracts";
import type { PendingChanges } from "@/modules/source-document/detail-types";
import { useSourceDocumentEntryMutations } from "./useSourceDocumentEntryMutations";
import { useSourceDocumentRecordMutations } from "./useSourceDocumentRecordMutations";
import type { BatchEntryUpdateData } from "./source-document-detail-cache";

interface UseSourceDocumentDetailMutationsOptions {
  id: string;
  ledgerId: string | undefined;
  onClose: () => void;
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

export function useSourceDocumentDetailMutations({
  id,
  ledgerId,
  onClose,
}: UseSourceDocumentDetailMutationsOptions) {
  const tCommon = useTranslations("Common");
  const queryClient = useQueryClient();

  const { deleteDocumentMutation } = useSourceDocumentRecordMutations({
    id,
    ledgerId,
    onClose,
  });

  const { batchUpdateMutation, batchDeleteMutation } = useSourceDocumentEntryMutations({
    ledgerId,
  });

  const saveChangesMutation = useLedgerMutation<
    Awaited<ReturnType<typeof saveSourceDocumentChangesAction>>,
    SaveDetailChanges
  >(ledgerId, {
    mutationFn: async ({ expectedRevisionId, operationId, changes }: SaveDetailChanges) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      return saveSourceDocumentChangesAction(ledgerId, {
        sourceDocumentId: id,
        expectedRevisionId,
        operationId,
        ...(Object.keys(changes.sourceDoc).length === 0
          ? {}
          : { sourceDocument: changes.sourceDoc }),
        entries: Object.entries(changes.entries)
          .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
          .map(([ledgerEntryId, data]) => ({
            ledgerEntryId,
            data,
          })),
      });
    },
    successMessage: null,
    errorMessage: null,
    resourceGroups: ["documents", "entries"],
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    onSuccess: (result) => {
      if (ledgerId == null || ledgerId === "") return;
      queryClient.setQueryData(queryKeys.sourceDocument(ledgerId, id), result.sourceDocument);
    },
  });

  const splitMutation = useLedgerMutation<
    Awaited<ReturnType<typeof splitSourceDocumentAction>>,
    Omit<SplitSourceDocumentInput, "sourceDocumentId">
  >(ledgerId, {
    mutationFn: async (input: Omit<SplitSourceDocumentInput, "sourceDocumentId">) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      return splitSourceDocumentAction(ledgerId, { sourceDocumentId: id, ...input });
    },
    successMessage: null,
    errorMessage: null,
    resourceGroups: ["documents", "entries"],
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    onSuccess: (result) => {
      if (ledgerId == null || ledgerId === "") return;
      queryClient.setQueryData(queryKeys.sourceDocument(ledgerId, id), result.sourceDocument);
    },
  });

  const addEntryMutation = useLedgerMutation<
    Awaited<ReturnType<typeof createLedgerEntryAction>>,
    AddEntryData
  >(ledgerId, {
    mutationFn: async (data: AddEntryData) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      const operationId = crypto.randomUUID();
      return createLedgerEntryAction(
        ledgerId,
        { sourceDocumentId: id, ...data, amount: String(data.amount) },
        operationId
      );
    },
    successMessage: null,
    errorMessage: null,
    resourceGroups: ["entries"],
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  const deleteEntryMutation = useLedgerMutation<
    Awaited<ReturnType<typeof deleteLedgerEntryAction>>,
    string
  >(ledgerId, {
    mutationFn: async (entryId: string) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      const operationId = crypto.randomUUID();
      return deleteLedgerEntryAction(ledgerId, entryId, operationId);
    },
    successMessage: null,
    errorMessage: null,
    resourceGroups: ["entries"],
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
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
