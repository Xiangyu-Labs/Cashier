import type { Ledger, LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Loader2 } from "lucide-react";
import { type PeriodParams } from "@/lib/period-utils";
import {
  queryKeys,
} from "@/lib/query-keys";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { useLayoutTransition } from "@/hooks/use-layout-transition";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useSelection } from "@/hooks/use-selection";
import { getLedgerStatsAction } from "@/modules/ledger/actions";
import { useLedgerEntriesMutations } from "@/modules/ledger/hooks";
import { useBatchSourceDocumentActions,
  useSourceDocumentStream,
} from "@/modules/source-document/hooks";
import {
  retrySourceDocumentAction,
  acceptSourceDocumentCandidateAction,
  abandonSourceDocumentCandidateAction,
} from "@/modules/source-document/actions";
import { notifyNewSubmission } from "@/modules/source-document/hooks/revision-state-refresh";
import { getLedgerTransactionManager } from "@/lib/mutations/cache-transaction";
import {
  applyOptimisticUpsert,
  getStreamQueryMatches,
} from "@/modules/source-document/hooks/source-document-optimistic-cache";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import { toast } from "sonner";
import { type EntryFilters } from "@/modules/ledger/ui";
import type { LedgerAdvancedFilters } from "@/modules/workspace/initial-query-state";
import type { StreamStatusPreset } from "@/modules/workspace/ledger-filter-state";
import { LedgerEntriesToolbar } from "./LedgerEntriesToolbar";
import { LedgerEntriesLoading } from "./LedgerEntriesLoading";
import { LedgerEntriesUnifiedGroups } from "./LedgerEntriesCompletedGroups";
import { LedgerEntriesOverlays } from "./LedgerEntriesOverlays";
import { useLedgerEntriesTabState } from "./useLedgerEntriesTabState";
import { useLedgerEntriesFilters } from "./useLedgerEntriesFilters";

interface LedgerEntriesTabProps {
  ledgerId: string;
  categories: EntryCategory[];
  ledger?: Ledger;
  periodParams: PeriodParams;
  onFiltersChange: (filters: EntryFilters) => void;
  advancedFilters?: LedgerAdvancedFilters;
  collapseEntriesDefault?: boolean;
  onApplyPreset?: (preset: StreamStatusPreset) => void;
  statusSummaryRef?: React.RefObject<HTMLSpanElement | null> | undefined;
}

export function LedgerEntriesTab({
  ledgerId,
  categories,
  ledger,
  periodParams,
  onFiltersChange,
  advancedFilters,
  collapseEntriesDefault = false,
  onApplyPreset,
  statusSummaryRef,
}: LedgerEntriesTabProps) {
  const t = useTranslations("LedgerEntriesTab");
  const tCommon = useTranslations("Common");
  const tFilter = useTranslations("EntryFilterPanel");
  const tActions = useTranslations("CandidateAction");
  const queryClient = useQueryClient();
  const pushModal = useModalStackStore((state) => state.push);
  const { containerProps, getItemProps, layoutGroupId: _layoutGroupId } = useLayoutTransition();
  const { filters, startDateStr, endDateStr } = useLedgerEntriesFilters(periodParams, advancedFilters);
  const mainCurrency = ledger?.metadata?.settings?.mainCurrency ?? "CNY";

  const { data: summaryData } = useQuery({
    queryKey: queryKeys.summary(ledgerId, startDateStr, endDateStr, mainCurrency, null),
    queryFn: () =>
      getLedgerStatsAction(
        ledgerId,
        startDateStr !== "" ? startDateStr : undefined,
        endDateStr !== "" ? endDateStr : undefined,
        mainCurrency,
        {
          ...(filters.minAmount !== undefined ? { minAmount: filters.minAmount } : {}),
          ...(filters.maxAmount !== undefined ? { maxAmount: filters.maxAmount } : {}),
        }
      ),
  });
  const filteredTotal = Number(summaryData?.convertedTotal?.total ?? 0);

  const {
    deleteConfirm,
    setDeleteConfirm,
    retrySourceDocument,
    setRetrySourceDocument,
    openSourceDocumentDeleteConfirm,
    closeDeleteConfirm,
    closeRetrySourceDocument,
  } = useLedgerEntriesTabState();

  const { deleteEntry } = useLedgerEntriesMutations(ledgerId, categories);

  // Transaction-scoped mutations for stream card actions
  const txnManager = getLedgerTransactionManager(ledgerId);

  const retryMutation = useMutation<void, Error, SourceDocument, { operationId: string }>({
    mutationFn: async (doc) => {
      const operationId = crypto.randomUUID();
      await retrySourceDocumentAction(ledgerId, doc.id, operationId);
    },
    onMutate: (doc) => {
      // Capture current entity from stream cache for rollback
      const matches = getStreamQueryMatches(queryClient, ledgerId);
      let prevEntity: SourceDocumentListItemDto | null = null;
      for (const [, data] of matches) {
        if (!data) continue;
        for (const page of data.pages) {
          const found = page.items.find((item) => item.id === doc.id);
          if (found) { prevEntity = found; break; }
        }
        if (prevEntity) break;
      }

      const op = txnManager.startOperation(ledgerId);
      op.patches.push({
        type: "upsert",
        entityId: doc.id,
        entity: { ...doc, status: "queued" } as unknown as SourceDocumentListItemDto,
        prevEntity: prevEntity as unknown as SourceDocumentListItemDto | null,
      });

      applyOptimisticUpsert(queryClient, ledgerId, { ...doc, status: "queued" } as unknown as SourceDocumentListItemDto);
      notifyNewSubmission();
      return { operationId: op.operationId };
    },
    onSuccess: (_data, _variables, context) => {
      if (context?.operationId) txnManager.commitOperation(context.operationId, null, queryClient);
    },
    onError: (_error, _variables, context) => {
      if (context?.operationId) txnManager.rollbackOperation(context.operationId, queryClient);
    },
  });

  const acceptCandidateMutation = useMutation<void, Error, SourceDocument, { operationId: string }>({
    mutationFn: async (doc) => {
      if (doc.pendingRevisionId == null) throw new Error("No pending revision");
      const operationId = crypto.randomUUID();
      await acceptSourceDocumentCandidateAction(ledgerId, doc.id, doc.pendingRevisionId, operationId);
    },
    onMutate: (doc) => {
      const matches = getStreamQueryMatches(queryClient, ledgerId);
      let prevEntity: SourceDocumentListItemDto | null = null;
      for (const [, data] of matches) {
        if (!data) continue;
        for (const page of data.pages) {
          const found = page.items.find((item) => item.id === doc.id);
          if (found) { prevEntity = found; break; }
        }
        if (prevEntity) break;
      }

      const op = txnManager.startOperation(ledgerId);
      op.patches.push({
        type: "upsert",
        entityId: doc.id,
        entity: { ...doc, status: "completed" } as unknown as SourceDocumentListItemDto,
        prevEntity: prevEntity as unknown as SourceDocumentListItemDto | null,
      });

      applyOptimisticUpsert(queryClient, ledgerId, { ...doc, status: "completed" } as unknown as SourceDocumentListItemDto);
      return { operationId: op.operationId };
    },
    onSuccess: (_data, _variables, context) => {
      if (context?.operationId) txnManager.commitOperation(context.operationId, null, queryClient);
      toast.success(tActions("acceptSuccess"));
    },
    onError: (_error, _variables, context) => {
      if (context?.operationId) txnManager.rollbackOperation(context.operationId, queryClient);
      toast.error(tActions("acceptError"));
    },
  });

  const abandonCandidateMutation = useMutation<void, Error, SourceDocument, { operationId: string }>({
    mutationFn: async (doc) => {
      if (doc.pendingRevisionId == null) throw new Error("No pending revision");
      const operationId = crypto.randomUUID();
      await abandonSourceDocumentCandidateAction(ledgerId, doc.id, doc.pendingRevisionId, operationId);
    },
    onMutate: (doc) => {
      const matches = getStreamQueryMatches(queryClient, ledgerId);
      let prevEntity: SourceDocumentListItemDto | null = null;
      for (const [, data] of matches) {
        if (!data) continue;
        for (const page of data.pages) {
          const found = page.items.find((item) => item.id === doc.id);
          if (found) { prevEntity = found; break; }
        }
        if (prevEntity) break;
      }

      const op = txnManager.startOperation(ledgerId);
      op.patches.push({
        type: "upsert",
        entityId: doc.id,
        entity: { ...doc, status: "completed" } as unknown as SourceDocumentListItemDto,
        prevEntity: prevEntity as unknown as SourceDocumentListItemDto | null,
      });

      applyOptimisticUpsert(queryClient, ledgerId, { ...doc, status: "completed" } as unknown as SourceDocumentListItemDto);
      return { operationId: op.operationId };
    },
    onSuccess: (_data, _variables, context) => {
      if (context?.operationId) txnManager.commitOperation(context.operationId, null, queryClient);
      toast.success(tActions("abandonSuccess"));
    },
    onError: (_error, _variables, context) => {
      if (context?.operationId) txnManager.rollbackOperation(context.operationId, queryClient);
      toast.error(tActions("abandonError"));
    },
  });

  // Use the unified stream hook with paginated all-statuses results
  const {
    streamGroups,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refresh,
  } = useSourceDocumentStream(ledgerId, {
    dateRange: {
      ...(filters.startDate !== undefined ? { start: filters.startDate } : {}),
      ...(filters.endDate !== undefined ? { end: filters.endDate } : {}),
    },
    ...(filters.minAmount != null ? { minAmount: filters.minAmount } : {}),
    ...(filters.maxAmount != null ? { maxAmount: filters.maxAmount } : {}),
    ...(filters.statuses != null && filters.statuses.length > 0 ? { statuses: filters.statuses } : {}),
  });

  // Build groupedItems from completed groups for useGroupedEntries — no longer needed
  // Selection uses unified stream groups
  const allSourceDocumentIds = useMemo(
    () => streamGroups.flatMap((g) => g.items.map((i) => i.sourceDocument.id)),
    [streamGroups]
  );

  const {
    isSelectionMode,
    toggleSelectionMode,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isAllSelected,
  } = useSelection({ allIds: allSourceDocumentIds });

  const { deleteSourceDocument, batchUpdateDates } =
    useBatchSourceDocumentActions(ledgerId, clearSelection);

  // C1: Targeted refresh — uses the bounded refresh path via coordinator
  const handleRefresh = useCallback(async () => {
    // Notify the coordinator of a change — triggers immediate refresh cycle
    notifyNewSubmission();
    // Also refresh the live ledger stats via the actual stream refresh
    if (refresh) {
      await refresh();
    }
  }, [refresh]);

  const handleToggleSelectionMode = useCallback(() => {
    toggleSelectionMode();
  }, [toggleSelectionMode]);

  const handleViewSourceDetail = useCallback(
    (group: { sourceDocument: SourceDocument; ledgerEntries: LedgerEntry[] }) => {
      pushModal({
        type: "source-document",
        id: group.sourceDocument.id,
        ledgerId: group.sourceDocument.ledgerId,
      });
    },
    [pushModal]
  );

  const handleViewLedgerEntry = useCallback(
    (entry: LedgerEntry) => {
      pushModal({ type: "ledger-entry", id: entry.id, ledgerId: entry.ledgerId });
    },
    [pushModal]
  );

  const handleDeleteSourceConfirm = useCallback(
    (doc: SourceDocument) =>
      openSourceDocumentDeleteConfirm(doc.id, t("deleteConfirmTitle"), t("deleteConfirmDesc")),
    [openSourceDocumentDeleteConfirm, t]
  );

  const handleDirectRetry = useCallback(
    async (doc: SourceDocument) => {
      await retryMutation.mutateAsync(doc);
    },
    [retryMutation]
  );

  const handleAcceptCandidate = useCallback(
    async (doc: SourceDocument) => {
      if (doc.pendingRevisionId == null) return;
      await acceptCandidateMutation.mutateAsync(doc);
    },
    [acceptCandidateMutation]
  );

  const handleAbandonCandidate = useCallback(
    async (doc: SourceDocument) => {
      if (doc.pendingRevisionId == null) return;
      await abandonCandidateMutation.mutateAsync(doc);
    },
    [abandonCandidateMutation]
  );

  const handleDeleteConfirmAction = useCallback(() => {
    if (deleteConfirm.id == null || deleteConfirm.id === "" || deleteConfirm.type == null) return;
    if (deleteConfirm.type === "sourceDocument") deleteSourceDocument.mutate(deleteConfirm.id);
    else if (deleteConfirm.type === "ledgerEntry") deleteEntry.mutate(deleteConfirm.id);
    closeDeleteConfirm();
  }, [
    deleteConfirm,
    deleteSourceDocument,
    deleteEntry,
    closeDeleteConfirm,
  ]);

  const handleBatchUpdateDates = useCallback(
    (date: string) => batchUpdateDates.mutate({ ids: selectedIds, entryDate: date }),
    [batchUpdateDates, selectedIds]
  );

  const sentinelRef = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    rootMargin: "400px",
  });

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-4" {...containerProps}>
        <LedgerEntriesToolbar
          isSelectionMode={isSelectionMode}
          isAllSelected={isAllSelected}
            selectedCount={selectedIds.length}
            onToggleSelectionMode={handleToggleSelectionMode}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onUpdateDates={handleBatchUpdateDates}
            isUpdatingDates={batchUpdateDates.isPending}
            filters={filters}
            onFiltersChange={onFiltersChange}
            periodParams={periodParams}
            filteredTotalLabel={tFilter("filteredTotal")}
            mainCurrency={mainCurrency}
            filteredTotal={filteredTotal}
            statusSummaryRef={statusSummaryRef}
            {...(onApplyPreset != null ? { onApplyPreset } : {})}
          />

          {isLoading ? (
            <LedgerEntriesLoading />
          ) : (
            <>
              {/* Unified stream groups — all states in a single chronological sequence */}
              {streamGroups.length > 0 && (
                <LedgerEntriesUnifiedGroups
                  streamGroups={streamGroups}
                  mainCurrency={mainCurrency}
                  onViewLedgerEntry={handleViewLedgerEntry}
                  onViewSourceDetail={handleViewSourceDetail}
                  onRetry={setRetrySourceDocument}
                  onDirectRetry={handleDirectRetry}
                  onEditRetry={setRetrySourceDocument}
                  onAcceptCandidate={handleAcceptCandidate}
                  onAbandonCandidate={handleAbandonCandidate}
                  onDeleteSourceConfirm={handleDeleteSourceConfirm}
                  isSelectionMode={isSelectionMode}
                  selectedIds={selectedIds}
                  onToggleSelection={toggleSelection}
                  collapseEntriesDefault={collapseEntriesDefault}
                  noRecordsText={tCommon("noRecords")}
                  getItemProps={getItemProps}
                />
              )}

              {/* No records state */}
              {!isLoading && streamGroups.length === 0 && (
                <div className="space-y-6 px-2 pt-2">
                  <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-2">
                    <span>{tCommon("noRecords")}</span>
                  </div>
                </div>
              )}

              {/* Load completed history before the user reaches the list end. */}
              {hasNextPage && (
                <div ref={sentinelRef} className="flex h-12 justify-center py-4" aria-live="polite">
                  {isFetchingNextPage && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t("loadingMore")}
                    </span>
                  )}
                </div>
              )}

              {/* End of list indicator when no more pages */}
              {!hasNextPage && streamGroups.length > 0 && (
                <div className="flex justify-center py-4">
                  <span className="text-xs text-muted-foreground/50">- {t("noMore")} -</span>
                </div>
              )}
            </>
          )}
        </div>

        <LedgerEntriesOverlays
          deleteConfirm={deleteConfirm}
          onDeleteConfirmOpenChange={(open) => setDeleteConfirm((prev) => ({ ...prev, open }))}
          onDeleteConfirm={handleDeleteConfirmAction}
          deleteLabel={tCommon("delete")}
          retrySourceDocument={retrySourceDocument}
          onRetryDialogOpenChange={(open) => !open && closeRetrySourceDocument()}
          ledgerId={ledgerId}
        />
      </PullToRefresh>
  );
}
