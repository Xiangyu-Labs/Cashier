"use client";
import type { EntryCategoryWithCount } from "@/modules/ledger/contracts";
import { useTranslations } from "next-intl";
import type { Ledger } from "@/modules/ledger/contracts";
import { useLedgerSettingsMutation } from "./useLedgerSettingsMutation";
import { useLedgerSettingsQueries } from "./useLedgerSettingsQueries";

interface UseLedgerSettingsParams {
  ledgerId: string;
  ledger: Ledger;
  initialCategories: EntryCategoryWithCount[];
}

export function useLedgerSettings({
  ledgerId,
  ledger: initialLedger,
  initialCategories,
}: UseLedgerSettingsParams) {
  const t = useTranslations("Settings");
  const {
    ledger,
    categories,
    uncategorizedCount,
    credentials,
    isSettingsLoading,
    settingsQueryKey,
    settingsQueryStatus,
    settingsQueryIsFetching,
  } = useLedgerSettingsQueries({
    ledgerId,
    initialLedger,
    initialCategories,
  });

  const updateLedgerMutation = useLedgerSettingsMutation({
    ledgerId,
    successMessage: t("updateSuccess"),
    errorMessage: t("updateFailed"),
  });

  return {
    ledger,
    categories,
    uncategorizedCount,
    credentials,
    updateLedgerMutation,
    isPending: updateLedgerMutation.isPending,
    isSettingsLoading,
    settingsQueryKey,
    settingsQueryStatus,
    settingsQueryIsFetching,
  };
}
