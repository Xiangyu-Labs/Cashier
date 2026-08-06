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
import { updateLedgerAction } from "@/modules/ledger/server-actions/update";
import type { Ledger, UpdateLedgerActionErrorCode } from "@/modules/ledger/contracts";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export interface UpdateLedgerData {
  currencies?: string[];
  mainCurrency?: string;
  aiLanguage?: string;
  collapseEntriesDefault?: boolean;
  aiCustomPrompt?: string;
  duplicateDetectionEnabled?: boolean;
  timeZone?: string | null;
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
  const t = useTranslations("Settings");
  const queryClient = useQueryClient();
  const ledgerQueryKey = queryKeys.ledger(ledgerId);

  return useLedgerMutation<Ledger, UpdateLedgerData>(ledgerId, {
    mutationFn: async (data) => {
      const {
        currencies,
        mainCurrency,
        aiLanguage,
        collapseEntriesDefault,
        aiCustomPrompt,
        duplicateDetectionEnabled,
        timeZone,
      } = data;
      const payload: { settings?: Record<string, unknown> } = {};

      const settings: Record<string, unknown> = {};
      if (currencies !== undefined) settings.currencies = currencies;
      if (mainCurrency !== undefined) settings.mainCurrency = mainCurrency;
      if (aiLanguage !== undefined) settings.aiLanguage = aiLanguage;
      if (collapseEntriesDefault !== undefined) {
        settings.collapseEntriesDefault = collapseEntriesDefault;
      }
      if (aiCustomPrompt !== undefined) settings.aiCustomPrompt = aiCustomPrompt;
      if (duplicateDetectionEnabled !== undefined) {
        settings.duplicateDetectionEnabled = duplicateDetectionEnabled;
      }
      if (timeZone !== undefined) settings.timeZone = timeZone;

      if (Object.keys(settings).length > 0) {
        payload.settings = settings;
      }

      const result = await updateLedgerAction(ledgerId, payload);
      if (!result.ok) throw new Error(t(updateLedgerErrorMessageKeys[result.code]));
      return result.ledger;
    },
    successMessage,
    errorMessage: null,
    invalidatePredicates: [
      invalidateLedgerEntries(ledgerId),
      invalidateSourceDocuments(ledgerId),
      invalidateLedgerStats(ledgerId),
      invalidateCalendar(ledgerId),
    ],
    onSuccessExtra: (data) => {
      queryClient.setQueryData<Ledger>(ledgerQueryKey, data);
    },
    onErrorExtra: (error) => toast.error(error.message || errorMessage),
  });
}

export const updateLedgerErrorMessageKeys = {
  rates_unavailable: "ratesUnavailable",
  unsupported_currency: "unsupportedCurrency",
  validation_failed: "validationFailed",
  conflict: "updateConflict",
  unexpected: "updateFailed",
} as const satisfies Record<UpdateLedgerActionErrorCode, string>;
