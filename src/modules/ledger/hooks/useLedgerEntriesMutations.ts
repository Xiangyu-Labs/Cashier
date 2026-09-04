"use client";
import { useTranslations } from "next-intl";
import {
  updateLedgerEntryAction,
  deleteLedgerEntryAction,
} from "@/modules/ledger/server-actions/entries";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { unwrapVersionedCommandResult } from "@/modules/source-document/command-results";

type UpdateVariables = {
  entry: LedgerEntryDto;
  data: Partial<Omit<LedgerEntryDto, "amount">> & { amount?: number };
};
export function useLedgerEntriesMutations(ledgerId: string) {
  const tCommon = useTranslations("Common");
  const updateEntry = useLedgerMutation<{ ledgerEntryId: string }, UpdateVariables>(ledgerId, {
    mutationFn: async ({ entry, data }) => {
      if (entry.sourceDocument == null) throw new Error("Entry has no source document");
      const { amount, ...rest } = data;
      const result = await updateLedgerEntryAction(
        ledgerId,
        {
          sourceDocumentId: entry.sourceDocument.id,
          expectedVersion: entry.sourceDocument.version,
        },
        entry.id,
        { ...rest, ...(amount == null ? {} : { amount: String(amount) }) }
      );
      return unwrapVersionedCommandResult(result);
    },
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    errorMessage: tCommon("saveFailed"),
  });

  const deleteEntry = useLedgerMutation<{ ledgerEntryId: string; deleted: true }, LedgerEntryDto>(
    ledgerId,
    {
      mutationFn: async (entry) => {
        if (entry.sourceDocument == null) throw new Error("Entry has no source document");
        const result = await deleteLedgerEntryAction(
          ledgerId,
          {
            sourceDocumentId: entry.sourceDocument.id,
            expectedVersion: entry.sourceDocument.version,
          },
          entry.id
        );
        return unwrapVersionedCommandResult(result);
      },
      invalidationErrorMessage: tCommon("savedRefreshFailed"),
      successMessage: tCommon("deleteSuccess"),
      errorMessage: tCommon("deleteFailed"),
    }
  );

  return {
    updateEntry,
    deleteEntry,
  };
}
