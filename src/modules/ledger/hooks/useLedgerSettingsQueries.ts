"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSmartPolling } from "@/hooks/use-smart-polling";
import { queryKeys } from "@/lib/query-keys";
import {
  getEntryCategoriesAction,
  getLedgerAction,
  getLedgerSettingsAction,
} from "@/modules/ledger/actions";
import type { EntryCategoryWithCount, Ledger, ServiceCredential } from "@/modules/ledger/contracts";

interface UseLedgerSettingsQueriesParams {
  ledgerId: string;
  initialLedger: Ledger;
  initialCategories: EntryCategoryWithCount[];
}

export function useLedgerSettingsQueries({
  ledgerId,
  initialLedger,
  initialCategories,
}: UseLedgerSettingsQueriesParams) {
  const categoryMetadataPolling = useSmartPolling<EntryCategoryWithCount[]>({
    isPollingActive: useCallback(
      (data) =>
        data?.some(
          (category) =>
            category.icon == null ||
            category.icon === "" ||
            category.description == null ||
            category.description === ""
        ) ?? false,
      []
    ),
  });

  const { data: ledger = initialLedger } = useQuery<Ledger | null>({
    queryKey: queryKeys.ledger(ledgerId),
    queryFn: () => getLedgerAction(ledgerId),
    initialData: initialLedger,
  });

  const { data: categories = initialCategories } = useQuery<EntryCategoryWithCount[]>({
    queryKey: queryKeys.entryCategories(ledgerId),
    queryFn: () => getEntryCategoriesAction(ledgerId),
    initialData: initialCategories,
    refetchInterval: categoryMetadataPolling,
  });

  const { data: settingsData, isLoading: isSettingsLoading } = useQuery<{
    uncategorizedCount: number;
    credentials: ServiceCredential[];
    mainCurrencyMutable: boolean;
  }>({
    queryKey: queryKeys.ledgerSettings(ledgerId),
    queryFn: () => getLedgerSettingsAction(ledgerId),
  });

  return {
    ledger,
    categories,
    uncategorizedCount: settingsData?.uncategorizedCount ?? 0,
    credentials: settingsData?.credentials ?? [],
    mainCurrencyMutable: settingsData?.mainCurrencyMutable ?? true,
    isSettingsLoading,
  };
}
