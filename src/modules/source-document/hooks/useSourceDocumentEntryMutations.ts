"use client";
import { useTranslations } from "next-intl";
import {
  batchDeleteLedgerEntriesAction,
  batchUpdateLedgerEntriesAction,
} from "@/modules/ledger/actions";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import type { BatchActionResult } from "@/lib/batch-ids";
import { type BatchEntryUpdateData } from "./source-document-detail-cache";

interface UseSourceDocumentEntryMutationsOptions {
  ledgerId: string | undefined;
}

export function useSourceDocumentEntryMutations({
  ledgerId,
}: UseSourceDocumentEntryMutationsOptions) {
  const tCommon = useTranslations("Common");
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
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  const batchDeleteMutation = useLedgerMutation<BatchActionResult, string[]>(ledgerId, {
    mutationFn: async (entryIds) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      return batchDeleteLedgerEntriesAction(ledgerId, entryIds);
    },
    successMessage: null,
    errorMessage: null,
    resourceGroups: ["entries"],
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  return {
    batchUpdateMutation,
    batchDeleteMutation,
  };
}
