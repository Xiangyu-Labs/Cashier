"use client";

import { useTranslations } from "next-intl";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { saveSourceDocumentChangesAction } from "@/modules/source-document/server-actions/update";
import { splitSourceDocumentAction } from "@/modules/source-document/server-actions/split";
import {
  createLedgerEntryAction,
  deleteLedgerEntryAction,
} from "@/modules/ledger/server-actions/entries";
import type {
  SaveSourceDocumentChangesResultDto,
  SplitSourceDocumentInput,
  SplitSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import {
  requireSourceDocumentVersion,
  unwrapVersionedCommandResult,
} from "@/modules/source-document/command-results";
import type { PendingChanges } from "@/modules/source-document/detail-types";
import { useSourceDocumentEntryMutations } from "./useSourceDocumentEntryMutations";
import { useSourceDocumentRecordMutations } from "./useSourceDocumentRecordMutations";
import type { BatchEntryUpdateData } from "./source-document-detail-cache";

interface UseSourceDocumentDetailMutationsOptions {
  id: string;
  ledgerId: string | undefined;
  /** Read fresh at submission time — never captured ahead of the actual click. */
  version: number | null;
  onClose: () => void;
}

interface SaveDetailChanges {
  expectedVersion: number;
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
  version,
  onClose,
}: UseSourceDocumentDetailMutationsOptions) {
  const tCommon = useTranslations("Common");

  const { deleteDocumentMutation } = useSourceDocumentRecordMutations({
    id,
    ledgerId,
    version,
    onClose,
  });

  const { batchUpdateMutation, batchDeleteMutation } = useSourceDocumentEntryMutations({
    ledgerId,
    sourceDocumentId: id,
    version,
  });

  const saveChangesMutation = useLedgerMutation<
    SaveSourceDocumentChangesResultDto,
    SaveDetailChanges
  >(ledgerId, {
    mutationFn: async ({ expectedVersion, changes }: SaveDetailChanges) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      const result = await saveSourceDocumentChangesAction(ledgerId, {
        sourceDocumentId: id,
        expectedVersion,
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
      return unwrapVersionedCommandResult(result);
    },
    successMessage: null,
    errorMessage: null,
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  const splitMutation = useLedgerMutation<
    SplitSourceDocumentResultDto,
    Omit<SplitSourceDocumentInput, "sourceDocumentId">
  >(ledgerId, {
    mutationFn: async (input: Omit<SplitSourceDocumentInput, "sourceDocumentId">) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      const result = await splitSourceDocumentAction(ledgerId, { sourceDocumentId: id, ...input });
      return unwrapVersionedCommandResult(result);
    },
    successMessage: null,
    errorMessage: null,
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  const addEntryMutation = useLedgerMutation<{ ledgerEntryId: string }, AddEntryData>(ledgerId, {
    mutationFn: async (data: AddEntryData) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      const expectedVersion = requireSourceDocumentVersion(version, id);
      const result = await createLedgerEntryAction(
        ledgerId,
        { sourceDocumentId: id, expectedVersion },
        { sourceDocumentId: id, ...data, amount: String(data.amount) }
      );
      return unwrapVersionedCommandResult(result);
    },
    successMessage: null,
    errorMessage: null,
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  const deleteEntryMutation = useLedgerMutation<{ ledgerEntryId: string; deleted: true }, string>(
    ledgerId,
    {
      mutationFn: async (entryId: string) => {
        if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
        const expectedVersion = requireSourceDocumentVersion(version, id);
        const result = await deleteLedgerEntryAction(
          ledgerId,
          { sourceDocumentId: id, expectedVersion },
          entryId
        );
        return unwrapVersionedCommandResult(result);
      },
      successMessage: null,
      errorMessage: null,
      invalidationErrorMessage: tCommon("savedRefreshFailed"),
    }
  );

  return {
    saveChanges: async (input: SaveDetailChanges) => {
      await saveChangesMutation.mutateAsync(input);
    },
    splitEntries: (input: Omit<SplitSourceDocumentInput, "sourceDocumentId">) =>
      splitMutation.mutateAsync(input),
    addEntry: async (data: AddEntryData) => {
      await addEntryMutation.mutateAsync(data);
    },
    deleteEntry: async (entryId: string) => {
      await deleteEntryMutation.mutateAsync(entryId);
    },
    batchUpdate: async (ids: string[], data: BatchEntryUpdateData) =>
      batchUpdateMutation.mutateAsync({ ids, data }),
    batchDeleteEntries: (entryIds: string[]) => batchDeleteMutation.mutateAsync(entryIds),
    deleteDocument: async () => {
      await deleteDocumentMutation.mutateAsync();
    },
    isSavingChanges: saveChangesMutation.isPending,
    isSplitting: splitMutation.isPending,
  };
}

export type { BatchEntryUpdateData };
