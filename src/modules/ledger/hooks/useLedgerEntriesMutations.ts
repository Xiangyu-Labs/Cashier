"use client";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { useTranslations } from "next-intl";
import {
  updateLedgerEntryAction,
  deleteLedgerEntryAction,
} from "@/modules/ledger/server-actions/entries";
import type { DeleteLedgerEntryResultDto } from "@/modules/ledger/contracts";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";

type UpdateEntryResult = LedgerEntryDto;
type DeleteEntryResult = DeleteLedgerEntryResultDto;
type UpdateVariables = {
  ledgerEntryId: string;
  data: Partial<Omit<LedgerEntryDto, "amount">> & { amount?: number };
};
export function useLedgerEntriesMutations(ledgerId: string, _categories: EntryCategory[]) {
  const tCommon = useTranslations("Common");
  const updateEntry = useLedgerMutation<UpdateEntryResult, UpdateVariables>(ledgerId, {
    mutationFn: async ({ ledgerEntryId, data }) => {
      const operationId = crypto.randomUUID();
      return updateLedgerEntryAction(
        ledgerId,
        ledgerEntryId,
        data,
        operationId
      ) as Promise<UpdateEntryResult>;
    },
    resourceGroups: ["entries"],
    errorMessage: tCommon("saveFailed"),
  });

  const deleteEntry = useLedgerMutation<DeleteEntryResult, string>(ledgerId, {
    mutationFn: async (ledgerEntryId) => {
      const operationId = crypto.randomUUID();
      return deleteLedgerEntryAction(
        ledgerId,
        ledgerEntryId,
        operationId
      ) as Promise<DeleteEntryResult>;
    },
    resourceGroups: ["entries"],
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
  });

  return {
    updateEntry,
    deleteEntry,
  };
}
