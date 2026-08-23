"use client";

import { useCallback, useEffect, useMemo } from "react";
import type { EntryCategory, Ledger, LedgerEntry } from "@/modules/ledger/contracts";
import type { EntryFilters } from "@/modules/ledger/ui/EntryFilterPanel";
import type { PeriodParams } from "@/lib/period-utils";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useDetailsTabData } from "@/modules/ledger/hooks/useDetailsTabData";
import { useDetailsTabGrouping } from "@/modules/ledger/hooks/useDetailsTabGrouping";
import { useDetailsTabFilters } from "./useDetailsTabFilters";
import { useDetailsBatchController } from "./useDetailsBatchController";
import { DetailsTabView } from "./DetailsTabView";
import type { TabQueryStateReport } from "@/components/tab-query-state";
import { openLedgerDetail } from "@/lib/navigation/ledger-detail-navigation";

interface DetailsTabProps {
  ledgerId: string;
  categories: EntryCategory[];
  ledger?: Ledger;
  periodParams: PeriodParams;
  onFiltersChange: (filters: EntryFilters) => void;
  advancedFilters: {
    categoryId?: string | null;
    currency?: string | null;
    minAmount?: string | null;
    maxAmount?: string | null;
    search?: string | null;
  };
  onResetFilters: () => void;
  timeZone?: string;
  onQueryStateChange?: (report: TabQueryStateReport) => void;
}

export function DetailsTab({
  ledgerId,
  categories,
  ledger,
  periodParams,
  onFiltersChange,
  advancedFilters,
  onResetFilters,
  timeZone,
  onQueryStateChange,
}: DetailsTabProps) {
  const data = useDetailsTabData({
    ledgerId,
    periodParams,
    advancedFilters,
    ...(timeZone != null ? { timeZone } : {}),
    ...(ledger !== undefined ? { ledger } : {}),
  });
  useEffect(() => {
    onQueryStateChange?.({
      ledgerId,
      tab: "details",
      queryKey: data.queryKey,
      status: data.queryStatus,
      isFetching: data.queryIsFetching,
      hasData: data.queryHasData,
    });
  }, [
    data.queryHasData,
    data.queryIsFetching,
    data.queryKey,
    data.queryStatus,
    ledgerId,
    onQueryStateChange,
  ]);
  const { groupedItems } = useDetailsTabGrouping(data.entries, timeZone);
  const entryIds = useMemo(() => data.entries.map((entry) => entry.id), [data.entries]);
  const queryFingerprint = useMemo(
    () =>
      JSON.stringify({
        tab: "details",
        period: periodParams,
        filters: advancedFilters,
      }),
    [advancedFilters, periodParams]
  );
  const batch = useDetailsBatchController(ledgerId, entryIds, queryFingerprint);
  const { filters } = useDetailsTabFilters({
    periodParams,
    advancedFilters,
    ...(timeZone != null ? { timeZone } : {}),
  });
  const sentinelRef = useInfiniteScroll({
    hasNextPage: data.hasNextPage,
    isFetchingNextPage: data.isFetchingNextPage,
    fetchNextPage: data.fetchNextPage,
  });
  const handleViewEntry = useCallback(
    (entry: LedgerEntry) =>
      openLedgerDetail({ type: "ledger-entry", id: entry.id, ledgerId: entry.ledgerId }),
    []
  );
  return (
    <DetailsTabView
      categories={categories}
      {...(ledger === undefined ? {} : { ledger })}
      periodParams={periodParams}
      filters={filters}
      advancedFilters={advancedFilters}
      onFiltersChange={onFiltersChange}
      onResetFilters={onResetFilters}
      entries={data.entries}
      groupedItems={groupedItems}
      isLoading={data.isLoading}
      isFetchingNextPage={data.isFetchingNextPage}
      isFetchNextPageError={data.isFetchNextPageError}
      onRetryNextPage={() => void data.fetchNextPage()}
      hasNextPage={data.hasNextPage}
      monthStats={data.monthStats}
      sentinelRef={sentinelRef}
      batch={batch}
      onViewEntry={handleViewEntry}
    />
  );
}
