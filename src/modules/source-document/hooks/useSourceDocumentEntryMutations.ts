"use client";
import { useTranslations } from "next-intl";
import {
  batchDeleteLedgerEntriesAction,
  batchUpdateLedgerEntriesAction,
} from "@/modules/ledger/actions";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import type { PartialBatchCommandResult } from "@/modules/source-document/contracts";
import { type BatchEntryUpdateData } from "./source-document-detail-cache";
import { unwrapAtomicBatchCommandResult } from "@/modules/source-document/command-results";

interface UseSourceDocumentEntryMutationsOptions {
  ledgerId: string | undefined;
  sourceDocumentId: string;
  version: number;
}

export function useSourceDocumentEntryMutations({
  ledgerId,
  sourceDocumentId,
  version,
}: UseSourceDocumentEntryMutationsOptions) {
  const tCommon = useTranslations("Common");
  const batchUpdateMutation = useLedgerMutation<
    { ledgerEntryIds: string[]; affectedCount: number } | undefined,
    { ids: string[]; data: BatchEntryUpdateData }
  >(ledgerId, {
    mutationFn: async ({ ids, data }) => {
      if (ledgerId == null || ledgerId === "") return;
      const { amount, ...rest } = data;
      const result = await batchUpdateLedgerEntriesAction(
        ledgerId,
        [{ sourceDocumentId, expectedVersion: version }],
        ids,
        {
          ...rest,
          ...(amount == null ? {} : { amount: String(amount) }),
        }
      );
      return unwrapAtomicBatchCommandResult(result);
    },
    errorMessage: null,
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  const batchDeleteMutation = useLedgerMutation<PartialBatchCommandResult, string[]>(ledgerId, {
    mutationFn: async (entryIds) => {
      if (ledgerId == null || ledgerId === "") throw new Error("No ledger ID");
      return batchDeleteLedgerEntriesAction(
        ledgerId,
        [{ sourceDocumentId, expectedVersion: version }],
        entryIds
      );
    },
    successMessage: null,
    errorMessage: null,
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
  });

  return {
    batchUpdateMutation,
    batchDeleteMutation,
  };
}
