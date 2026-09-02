"use client";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UnifiedStreamGroup } from "@/modules/source-document/stream-grouping";
import type { EntryFilters } from "@/modules/ledger/ui/EntryFilterPanel";
import { LedgerEntriesLoading } from "./LedgerEntriesLoading";
import { LedgerEntriesUnifiedGroups } from "./UnifiedStreamGroups";

interface LedgerEntriesStreamBodyProps {
  isLoading: boolean;
  streamGroups: UnifiedStreamGroup[];
  mainCurrency: string;
  filters: EntryFilters;
  onViewLedgerEntry: (entry: LedgerEntry) => void;
  onViewSourceDetail: (group: {
    sourceDocument: SourceDocument;
    ledgerEntries: LedgerEntry[];
  }) => void;
  onEditRetry: (doc: SourceDocument) => void;
  onDeleteSourceConfirm: (doc: SourceDocument) => void;
  isSelectionMode: boolean;
  selectedIds: string[];
  disableUnselected: boolean;
  onToggleSelection: (id: string) => void;
  timeZone?: string | undefined;
  collapseEntriesDefault: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => void;
  sentinelRef: (node: HTMLDivElement | null) => void;
}

/** The stream tab's list body: loading state, grouped results, empty state, and pagination footer. */
export function LedgerEntriesStreamBody({
  isLoading,
  streamGroups,
  mainCurrency,
  filters,
  onViewLedgerEntry,
  onViewSourceDetail,
  onEditRetry,
  onDeleteSourceConfirm,
  isSelectionMode,
  selectedIds,
  disableUnselected,
  onToggleSelection,
  timeZone,
  collapseEntriesDefault,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  fetchNextPage,
  sentinelRef,
}: LedgerEntriesStreamBodyProps) {
  const t = useTranslations("LedgerEntriesTab");
  const tCommon = useTranslations("Common");
  const tFilter = useTranslations("EntryFilterPanel");

  return (
    <div className="space-y-4">
      {isLoading ? (
        <LedgerEntriesLoading />
      ) : (
        <>
          {/* Unified stream groups — all states in a single chronological sequence */}
          {streamGroups.length > 0 && (
            <LedgerEntriesUnifiedGroups
              streamGroups={streamGroups}
              mainCurrency={mainCurrency}
              onViewLedgerEntry={onViewLedgerEntry}
              onViewSourceDetail={onViewSourceDetail}
              onEditRetry={onEditRetry}
              onDeleteSourceConfirm={onDeleteSourceConfirm}
              isSelectionMode={isSelectionMode}
              selectedIds={selectedIds}
              disableUnselected={disableUnselected}
              onToggleSelection={onToggleSelection}
              noRecordsText={tCommon("noRecords")}
              getItemProps={() => ({})}
              {...(timeZone != null ? { timeZone } : {})}
              collapseEntriesDefault={collapseEntriesDefault}
            />
          )}

          {/* No records state */}
          {!isLoading && streamGroups.length === 0 && (
            <div className="space-y-6 px-2 pt-2">
              <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-2">
                <span>
                  {filters.search != null ||
                  filters.minAmount != null ||
                  filters.maxAmount != null ||
                  (filters.statuses?.length ?? 0) > 0
                    ? tFilter("noMatchingResults")
                    : tCommon("noRecords")}
                </span>
              </div>
            </div>
          )}

          {/* Load completed history before the user reaches the list end. */}
          {hasNextPage && (
            <div ref={sentinelRef} className="flex h-12 justify-center py-4" aria-live="polite">
              {isFetchNextPageError ? (
                <Button variant="outline" size="sm" onClick={() => void fetchNextPage()}>
                  {t("loadMoreFailed")}
                </Button>
              ) : isFetchingNextPage ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("loadingMore")}
                </span>
              ) : null}
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
  );
}
