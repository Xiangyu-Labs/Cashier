"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EntryCategory, Ledger } from "@/modules/ledger/contracts";
import type { EntryFilters } from "@/modules/ledger/ui/EntryFilterPanel";
import type { PeriodParams } from "@/lib/period-utils";
import { invalidateLedgerEntries, invalidateLedgerStats } from "@/lib/query-keys";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useDetailsTabData } from "@/modules/ledger/hooks/useDetailsTabData";
import { useDetailsTabGrouping } from "@/modules/ledger/hooks/useDetailsTabGrouping";
import { useEntryMutations } from "@/modules/ledger/hooks/useEntryMutations";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { useDetailsTabState } from "./useDetailsTabState";
import { useDetailsTabFilters } from "./useDetailsTabFilters";
import { useDetailsBatchController } from "./useDetailsBatchController";
import { DetailsTabView } from "./DetailsTabView";
import type { TabQueryStateReport } from "./tab-query-state";

interface DetailsTabProps {
  ledgerId: string;
  categories: EntryCategory[];
  ledger?: Ledger;
  periodParams: PeriodParams;
  onFiltersChange: (filters: EntryFilters) => void;
  advancedFilters: {
    categoryId?: string | null;
    currency?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
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
  const queryClient = useQueryClient();
  const push = useModalStackStore((state) => state.push);
  const details = useDetailsTabState();
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
    });
  }, [data.queryIsFetching, data.queryKey, data.queryStatus, ledgerId, onQueryStateChange]);
  const { groupedItems } = useDetailsTabGrouping(data.entries, timeZone);
  const entryIds = useMemo(() => data.entries.map((entry) => entry.id), [data.entries]);
  const batch = useDetailsBatchController(ledgerId, entryIds);
  const { filters } = useDetailsTabFilters({
    periodParams,
    advancedFilters,
    ...(timeZone != null ? { timeZone } : {}),
  });
  const { updateEntry, deleteEntry } = useEntryMutations({
    ledgerId,
    categories,
    selectedLedgerEntry: details.selectedLedgerEntry,
    setSelectedLedgerEntry: details.setSelectedLedgerEntry,
  });
  const sentinelRef = useInfiniteScroll({
    hasNextPage: data.hasNextPage,
    isFetchingNextPage: data.isFetchingNextPage,
    fetchNextPage: data.fetchNextPage,
  });
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateLedgerEntries(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) }),
    ]);
  }, [ledgerId, queryClient]);
  const selectedSourceDocumentId = details.selectedLedgerEntry?.sourceDocumentId;

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
      hasNextPage={data.hasNextPage}
      monthStats={data.monthStats}
      sentinelRef={sentinelRef}
      batch={batch}
      selectedLedgerEntry={details.selectedLedgerEntry}
      isDetailModalOpen={details.isDetailModalOpen}
      onViewEntry={details.handleViewEntry}
      onCloseDetail={details.handleCloseDetail}
      onUpdateEntry={async (update) => {
        if (details.selectedLedgerEntry == null) return;
        await updateEntry.mutateAsync({
          ledgerEntryId: details.selectedLedgerEntry.id,
          data: update,
        });
      }}
      onDeleteEntry={async () => {
        if (details.selectedLedgerEntry != null) {
          await deleteEntry.mutateAsync(details.selectedLedgerEntry.id);
        }
      }}
      {...(selectedSourceDocumentId == null || selectedSourceDocumentId === ""
        ? {}
        : {
            onViewSourceDocument: () =>
              push({
                type: "source-document",
                id: selectedSourceDocumentId,
                ledgerId,
              }),
          })}
      onRefresh={handleRefresh}
    />
  );
}
