"use client";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { useTranslations } from "next-intl";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  updateLedgerEntryAction,
  deleteLedgerEntryAction,
} from "@/modules/ledger/server-actions/entries";
import type { DeleteLedgerEntryResultDto } from "@/modules/ledger/contracts";
import type { LedgerEntry } from "@/modules/ledger/contracts";

interface UseEntryMutationsParams {
  ledgerId: string;
  categories: EntryCategory[];
  selectedLedgerEntry: LedgerEntry | null;
  setSelectedLedgerEntry: (entry: LedgerEntry | null) => void;
}

export function useEntryMutations({
  ledgerId,
  categories: _categories,
  selectedLedgerEntry: _selectedLedgerEntry,
  setSelectedLedgerEntry: _setSelectedLedgerEntry,
}: UseEntryMutationsParams) {
  const tCommon = useTranslations("Common");
  const tLedger = useTranslations("LedgerEntriesTab");

  const updateEntry = useLedgerMutation<
    LedgerEntry,
    { ledgerEntryId: string; data: Partial<Omit<LedgerEntry, "amount">> & { amount?: number } }
  >(ledgerId, {
    mutationFn: async ({ ledgerEntryId, data }) => {
      const { amount, ...rest } = data;
      const result = await updateLedgerEntryAction(
        ledgerId,
        ledgerEntryId,
        {
          ...rest,
          ...(amount == null ? {} : { amount: String(amount) }),
        },
        crypto.randomUUID()
      );
      return result;
    },
    errorMessage: null,
    resourceGroups: ["entries"],
  });

  const deleteEntry = useLedgerMutation<DeleteLedgerEntryResultDto, string>(ledgerId, {
    mutationFn: (ledgerEntryId) =>
      deleteLedgerEntryAction(ledgerId, ledgerEntryId, crypto.randomUUID()),
    successMessage: tLedger("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    resourceGroups: ["entries"],
  });

  return {
    updateEntry,
    deleteEntry,
  };
}
