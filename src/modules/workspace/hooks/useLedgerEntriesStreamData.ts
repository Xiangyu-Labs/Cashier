"use client";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSourceDocumentStream } from "@/modules/source-document/hooks";
import { getStreamTotalAction } from "@/modules/source-document/actions";
import { buildStreamQueryDescriptor } from "@/modules/workspace/ledger-tab-query-descriptors";
import type { EntryFilters } from "@/modules/ledger/ui/EntryFilterPanel";
import type { TabQueryStateReport } from "@/components/tab-query-state";

interface UseLedgerEntriesStreamDataOptions {
  ledgerId: string;
  mainCurrency: string;
  filters: EntryFilters;
  startDateStr: string | undefined;
  endDateStr: string | undefined;
  onQueryStateChange?: ((report: TabQueryStateReport) => void) | undefined;
}

/**
 * Owns the unified source-document stream query, its auxiliary totals query,
 * and reporting the combined query state up to the tab shell.
 */
export function useLedgerEntriesStreamData({
  ledgerId,
  mainCurrency,
  filters,
  startDateStr,
  endDateStr,
  onQueryStateChange,
}: UseLedgerEntriesStreamDataOptions) {
  const streamQueryDescriptor = useMemo(
    () =>
      buildStreamQueryDescriptor({
        ledgerId,
        startDate: startDateStr,
        endDate: endDateStr,
        minAmount: filters.minAmount,
        maxAmount: filters.maxAmount,
        statuses: filters.statuses,
        search: filters.search,
      }),
    [
      endDateStr,
      filters.maxAmount,
      filters.minAmount,
      filters.search,
      filters.statuses,
      ledgerId,
      startDateStr,
    ]
  );
  const streamTotalQuery = useQuery({
    queryKey: streamQueryDescriptor.totalQueryKey,
    queryFn: () => getStreamTotalAction(ledgerId, streamQueryDescriptor.totalInput),
  });
  const { data: streamTotalData } = streamTotalQuery;
  const filteredTotal = streamTotalData?.total;
  const hasActiveFilters =
    filters.startDate != null ||
    filters.endDate != null ||
    filters.minAmount != null ||
    filters.maxAmount != null ||
    (filters.statuses?.length ?? 0) > 0 ||
    (filters.search?.trim().length ?? 0) > 0;

  // Use the unified stream hook with paginated all-statuses results
  const {
    streamGroups,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    queryKey,
    queryStatus,
    queryIsFetching,
    queryHasData,
  } = useSourceDocumentStream(ledgerId, {
    mainCurrency,
    dateRange: {
      ...(filters.startDate !== undefined ? { start: filters.startDate } : {}),
      ...(filters.endDate !== undefined ? { end: filters.endDate } : {}),
    },
    ...(filters.minAmount != null ? { minAmount: filters.minAmount } : {}),
    ...(filters.maxAmount != null ? { maxAmount: filters.maxAmount } : {}),
    ...(filters.statuses != null && filters.statuses.length > 0
      ? { statuses: filters.statuses }
      : {}),
    ...(filters.search != null ? { search: filters.search } : {}),
    queryDescriptor: streamQueryDescriptor,
  });
  const streamQueryStatus =
    queryStatus === "error" || streamTotalQuery.status === "error"
      ? "error"
      : queryStatus === "pending" || streamTotalQuery.status === "pending"
        ? "pending"
        : "success";
  const streamQueryIsFetching = queryIsFetching || streamTotalQuery.isFetching;
  // The total query is auxiliary; only page data counts as list data for the
  // error-with-data versus error-empty decision.
  const streamQueryHasData = queryHasData;
  useEffect(() => {
    onQueryStateChange?.({
      ledgerId,
      tab: "stream",
      queryKey,
      status: streamQueryStatus,
      isFetching: streamQueryIsFetching,
      hasData: streamQueryHasData,
    });
  }, [
    ledgerId,
    onQueryStateChange,
    queryKey,
    streamQueryHasData,
    streamQueryIsFetching,
    streamQueryStatus,
  ]);

  return {
    streamGroups,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    streamTotalData,
    filteredTotal,
    hasActiveFilters,
  };
}
