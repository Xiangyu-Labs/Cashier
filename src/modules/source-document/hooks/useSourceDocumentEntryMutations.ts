"use client";
import {
  batchDeleteLedgerEntriesAction,
  batchUpdateLedgerEntriesAction,
} from "@/modules/ledger/actions";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import type { BatchActionResult } from "@/lib/batch-ids";
import { type BatchEntryUpdateData } from "./source-document-detail-cache";

interface UseSourceDocumentEntryMutationsOptions {
  id: string;
  ledgerId: string | undefined;
}

export function useSourceDocumentEntryMutations({
  id: _id,
  ledgerId,
}: UseSourceDocumentEntryMutationsOptions) {
  const batchUpdateMutation = useLedgerMutation<
    { ledgerEntryIds: string[]; affectedCount: number } | undefined,
    { ids: string[]; data: BatchEntryUpdateData }
  >(ledgerId, {
    mutationFn: async ({ ids, data }) => {
      if (ledgerId == null || ledgerId === "") return;
      const { amount, ...rest } = data;
      return batchUpdateLedgerEntriesAction(ledgerId, ids, {
        ...rest,
        ...(amount == null ? {} : { amount: String(amount) }),
      });
    },
    errorMessage: null,
    resourceGroups: ["entries"],
  });

  const batchDeleteMutation = useLedgerMutation<BatchActionResult, string[]>(ledgerId, {
    mutationFn: async (entryIds) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      return batchDeleteLedgerEntriesAction(ledgerId, entryIds);
    },
    successMessage: null,
    errorMessage: null,
    resourceGroups: ["entries"],
  });

  return {
    batchUpdateMutation,
    batchDeleteMutation,
  };
}
