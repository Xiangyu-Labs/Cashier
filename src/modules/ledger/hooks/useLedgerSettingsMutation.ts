"use client";

import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { updateLedgerSettingsAction } from "@/modules/ledger/actions";
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
  expectedUpdatedAt: string;
  successMessage: string;
  errorMessage: string;
}

export function useLedgerSettingsMutation({
  ledgerId,
  expectedUpdatedAt,
  successMessage,
  errorMessage,
}: UseLedgerSettingsMutationParams) {
  const t = useTranslations("Settings");
  const tCommon = useTranslations("Common");
  const queryClient = useQueryClient();
  const translateError = (code: UpdateLedgerActionErrorCode) => {
    switch (code) {
      case "rates_unavailable":
        return t("ratesUnavailable");
      case "unsupported_currency":
        return t("unsupportedCurrency");
      case "validation_failed":
        return t("validationFailed");
      case "conflict":
        return t("updateConflict");
      case "unexpected":
        return t("updateFailed");
    }
  };

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
      const payload: { settings: Record<string, unknown> } = { settings: {} };

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

      payload.settings = settings;

      const result = await updateLedgerSettingsAction(ledgerId, {
        expectedUpdatedAt,
        ...payload,
      });
      if (!result.ok) throw new Error(translateError(result.code));
      return result.ledger;
    },
    successMessage,
    errorMessage: null,
    resourceGroups: ["settings"],
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    onSuccess: (savedLedger) => {
      queryClient.setQueryData(queryKeys.ledger(ledgerId), savedLedger);
    },
    onError: (error) => toast.error(error.message || errorMessage),
  });
}
