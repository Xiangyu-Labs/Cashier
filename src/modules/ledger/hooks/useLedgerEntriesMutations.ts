"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { useTranslations } from "next-intl";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  invalidateSourceDocumentStreamTotal,
} from "@/lib/query-keys";
import { updateLedgerEntryAction, deleteLedgerEntryAction } from "@/modules/ledger/actions";
import type { DeleteLedgerEntryResultDto } from "@/modules/ledger/contracts";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";
import { toast } from "sonner";

type UpdateEntryResult = LedgerEntryDto;
type DeleteEntryResult = DeleteLedgerEntryResultDto;
type UpdateVariables = {
  ledgerEntryId: string;
  data: Partial<Omit<LedgerEntryDto, "amount">> & { amount?: number };
};
export function useLedgerEntriesMutations(ledgerId: string, _categories: EntryCategory[]) {
  const queryClient = useQueryClient();
  const tCommon = useTranslations("Common");

  const updateEntry = useMutation<UpdateEntryResult, Error, UpdateVariables>({
    mutationFn: async ({ ledgerEntryId, data }) => {
      const operationId = crypto.randomUUID();
      return updateLedgerEntryAction(
        ledgerId,
        ledgerEntryId,
        data,
        operationId
      ) as Promise<UpdateEntryResult>;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ predicate: invalidateLedgerEntries(ledgerId) }),
        queryClient.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) }),
        queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) }),
        queryClient.invalidateQueries({ predicate: invalidateSourceDocumentStreamTotal(ledgerId) }),
        queryClient.invalidateQueries({ predicate: invalidateCalendar(ledgerId) }),
      ]);
    },
    onError: () => {
      toast.error(tCommon("saveFailed"));
    },
  });

  const deleteEntry = useMutation<DeleteEntryResult, Error, string>({
    mutationFn: async (ledgerEntryId) => {
      const operationId = crypto.randomUUID();
      return deleteLedgerEntryAction(
        ledgerId,
        ledgerEntryId,
        operationId
      ) as Promise<DeleteEntryResult>;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ predicate: invalidateLedgerEntries(ledgerId) }),
        queryClient.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) }),
        queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) }),
        queryClient.invalidateQueries({ predicate: invalidateSourceDocumentStreamTotal(ledgerId) }),
        queryClient.invalidateQueries({ predicate: invalidateCalendar(ledgerId) }),
      ]);
      toast.success(tCommon("deleteSuccess"));
    },
    onError: () => {
      toast.error(tCommon("deleteFailed"));
    },
  });

  return {
    updateEntry,
    deleteEntry,
  };
}
