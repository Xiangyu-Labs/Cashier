"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSmartPolling } from "@/hooks/use-smart-polling";
import { queryKeys } from "@/lib/query-keys";
import { getEntryCategoriesAction } from "@/modules/ledger/server-actions/categories";
import { getLedgerAction } from "@/modules/ledger/server-actions/get";
import { getLedgerSettingsAction } from "@/modules/ledger/server-actions/settings";
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
  const settingsQueryKey = useMemo(() => queryKeys.ledgerSettings(ledgerId), [ledgerId]);
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

  const settingsQuery = useQuery<{
    uncategorizedCount: number;
    credentials: ServiceCredential[];
  }>({
    queryKey: settingsQueryKey,
    queryFn: () => getLedgerSettingsAction(ledgerId),
  });
  const { data: settingsData, isLoading: isSettingsLoading } = settingsQuery;

  return {
    ledger,
    categories,
    uncategorizedCount: settingsData?.uncategorizedCount ?? 0,
    credentials: settingsData?.credentials ?? [],
    isSettingsLoading,
    settingsQueryKey,
    settingsQueryStatus: settingsQuery.status,
    settingsQueryIsFetching: settingsQuery.isFetching,
  };
}
