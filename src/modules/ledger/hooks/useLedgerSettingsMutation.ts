"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  queryKeys,
} from "@/lib/query-keys";
import { updateLedgerAction } from "@/modules/ledger/actions";
import type { Ledger } from "@/modules/ledger/contracts";

export interface UpdateLedgerData {
  preferredCurrencies?: string[];
  mainCurrency?: string;
  aiLanguage?: string;
  collapseEntriesDefault?: boolean;
  aiCustomPrompt?: string;
}

interface UseLedgerSettingsMutationParams {
  ledgerId: string;
  successMessage: string;
  errorMessage: string;
}

export function useLedgerSettingsMutation({
  ledgerId,
  successMessage,
  errorMessage,
}: UseLedgerSettingsMutationParams) {
  const queryClient = useQueryClient();
  const ledgerQueryKey = queryKeys.ledger(ledgerId);

  return useLedgerMutation<Ledger, UpdateLedgerData>(ledgerId, {
    mutationFn: async (data) => {
      const {
        preferredCurrencies,
        mainCurrency,
        aiLanguage,
        collapseEntriesDefault,
        aiCustomPrompt,
      } = data;
      const payload: { settings?: Record<string, unknown> } = {};

      const settings: Record<string, unknown> = {};
      if (preferredCurrencies !== undefined) settings.currencies = preferredCurrencies;
      if (mainCurrency !== undefined) settings.mainCurrency = mainCurrency;
      if (aiLanguage !== undefined) settings.aiLanguage = aiLanguage;
      if (collapseEntriesDefault !== undefined) {
        settings.collapseEntriesDefault = collapseEntriesDefault;
      }
      if (aiCustomPrompt !== undefined) settings.aiCustomPrompt = aiCustomPrompt;

      if (Object.keys(settings).length > 0) {
        payload.settings = settings;
      }

      return await updateLedgerAction(ledgerId, payload);
    },
    successMessage,
    errorMessage,
    skipInvalidation: true,
    onSuccessExtra: (data) => {
      queryClient.setQueryData<Ledger>(ledgerQueryKey, data);
    },
    onOptimisticUpdate: (_, newData) => {
      const snapshots = queryClient.getQueriesData<Ledger>({ queryKey: ledgerQueryKey });

      queryClient.setQueryData<Ledger>(ledgerQueryKey, (old) => {
        if (!old) return old;

        const updated = { ...old };

        if (
          newData.preferredCurrencies !== undefined ||
          newData.mainCurrency !== undefined ||
          newData.aiLanguage !== undefined ||
          newData.collapseEntriesDefault !== undefined ||
          newData.aiCustomPrompt !== undefined
        ) {
          updated.metadata = {
            ...old.metadata,
            settings: {
              ...old.metadata?.settings,
              ...(newData.preferredCurrencies !== undefined && {
                currencies: newData.preferredCurrencies,
              }),
              ...(newData.mainCurrency !== undefined && { mainCurrency: newData.mainCurrency }),
              ...(newData.aiLanguage !== undefined && { aiLanguage: newData.aiLanguage }),
              ...(newData.collapseEntriesDefault !== undefined && {
                collapseEntriesDefault: newData.collapseEntriesDefault,
              }),
              ...(newData.aiCustomPrompt !== undefined && {
                aiCustomPrompt: newData.aiCustomPrompt,
              }),
            },
          };
        }

        return updated;
      });

      return { snapshots };
    },
    onSettledExtra: async (qc, variables, _data, error) => {
      if (error != null || variables.mainCurrency === undefined) return;
      await Promise.all([
        qc.invalidateQueries({ predicate: invalidateLedgerEntries(ledgerId) }),
        qc.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) }),
        qc.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) }),
        qc.invalidateQueries({ predicate: invalidateCalendar(ledgerId) }),
      ]);
    },
  });
}
