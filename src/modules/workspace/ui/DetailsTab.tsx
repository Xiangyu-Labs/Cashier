"use client";
import { useCallback } from "react";
import type { Ledger } from "@/modules/ledger/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { useModalStackStore } from "@/lib/store/modal-stack";
import {
  invalidateLedgerEntries,
  invalidateLedgerStats,
} from "@/lib/query-keys";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import {
  useDetailsTabData,
  useDetailsTabGrouping,
  useEntryMutations,
} from "@/modules/ledger/hooks";
import { EntryFilterPanel, LedgerEntryCard, LedgerEntryDetailModal } from "@/modules/ledger/ui";
import type { EntryFilters } from "@/modules/ledger/ui";
import { DetailsToolbar } from "./DetailsToolbar";
import { EmptyState } from "./EmptyState";
import { EntryGroupHeader } from "./EntryGroupHeader";
import { useDetailsTabState } from "./useDetailsTabState";
import { useDetailsTabFilters } from "./useDetailsTabFilters";
import type { EntryCategory } from "@/modules/ledger/contracts";
import type { PeriodParams } from "@/lib/period-utils";

interface DetailsTabProps {
  ledgerId: string;
  categories: EntryCategory[];
  ledger?: Ledger;
  periodParams: PeriodParams;
  onPeriodChange: (params: PeriodParams) => void;
  onFiltersChange: (filters: EntryFilters) => void;
  advancedFilters: {
    categoryId?: string | null;
    currency?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
  };
}

export function DetailsTab({
  ledgerId,
  categories,
  ledger,
  periodParams,
  onPeriodChange,
  onFiltersChange,
  advancedFilters,
}: DetailsTabProps) {
  const t = useTranslations("DetailsTab");
  const tCommon = useTranslations("Common");
  const _locale = useLocale();
  const queryClient = useQueryClient();
  const push = useModalStackStore((state) => state.push);

  // State management
  const {
    deleteConfirm,
    setDeleteConfirm,
    selectedLedgerEntry,
    setSelectedLedgerEntry,
    isDetailModalOpen,
    setIsDetailModalOpen,
    handleDeleteConfirm,
    handleViewEntry,
    handleCloseDetail,
  } = useDetailsTabState();
  const selectedSourceDocumentId = selectedLedgerEntry?.sourceDocumentId;

  // Data fetching
  const { entries, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, monthStats } =
    useDetailsTabData({
      ledgerId,
      periodParams,
      advancedFilters,
      ...(ledger !== undefined ? { ledger } : {}),
    });

  // Grouping
  const { groupedItems } = useDetailsTabGrouping(entries);

  // Filters
  const { filters } = useDetailsTabFilters({
    periodParams,
    advancedFilters,
  });

  // Mutations
  const { updateEntry, deleteEntry } = useEntryMutations({
    ledgerId,
    categories,
    selectedLedgerEntry,
    setSelectedLedgerEntry,
    setIsDetailModalOpen,
  });

  // Infinite scroll
  const sentinelRef = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  // Handlers
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateLedgerEntries(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) }),
    ]);
  }, [queryClient, ledgerId]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-4">
        <DetailsToolbar
          totalLabel={`${monthStats.mainCurrency} ${Number(monthStats.mainTotal).toFixed(2)}`}
        >
          <EntryFilterPanel
            filters={filters}
            onFiltersChange={onFiltersChange}
            periodParams={periodParams}
            onPeriodChange={onPeriodChange}
            categories={categories}
            preferredCurrencies={ledger?.metadata?.settings?.currencies ?? []}
            className="flex-1 sm:flex-none"
          />
        </DetailsToolbar>

        {/* Entry Groups */}
        <div className="space-y-6 pt-2">
          <AnimatePresence mode="popLayout">
            {groupedItems.map((group) => (
              <motion.div
                key={group.title}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                <EntryGroupHeader
                  title={group.title}
                  totalLabel={`${monthStats.mainCurrency} ${group.total.toFixed(2)}`}
                />
                <div className="space-y-4 px-2">
                  {group.items.map((entry) => (
                    <motion.div
                      key={entry.id}
                      layout
                      layoutId={entry.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                    >
                      <LedgerEntryCard
                        ledgerEntry={entry}
                        categories={categories}
                        {...(ledger?.metadata?.settings?.mainCurrency !== undefined
                          ? { mainCurrency: ledger.metadata.settings.mainCurrency }
                          : {})}
                        onView={() => {
                          handleViewEntry(entry);
                        }}
                      />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Loading State */}
          {isLoading && (
            <div className="space-y-4 px-2 animate-pulse">
              {[1, 2, 3].map((idx) => (
                <div key={idx} className="bg-surface rounded-xl border border-border p-4 h-20" />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && entries.length === 0 && (
            <EmptyState title={tCommon("noRecords")} />
          )}

          {/* Infinite Scroll Sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <span className="text-sm text-muted-foreground">{tCommon("loading")}</span>
            </div>
          )}
          {!hasNextPage && entries.length > 0 && (
            <div className="flex justify-center py-4">
              <span className="text-xs text-muted-foreground/50">— {t("noMore")} —</span>
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {selectedLedgerEntry && (
          <LedgerEntryDetailModal
            ledgerEntry={selectedLedgerEntry}
            categories={categories}
            open={isDetailModalOpen}
            onClose={handleCloseDetail}
            onUpdate={(data) =>
              updateEntry.mutate({
                ledgerEntryId: selectedLedgerEntry.id,
                data,
              })
            }
            onDelete={() => setDeleteConfirm({ open: true, id: selectedLedgerEntry.id })}
            {...(selectedSourceDocumentId != null && selectedSourceDocumentId !== ""
              ? {
                  onViewSourceDocument: () =>
                    push({
                      type: "source-document",
                      id: selectedSourceDocumentId,
                      ledgerId,
                    }),
                }
              : {})}
          />
        )}

        {/* Delete Confirmation */}
        <ConfirmDialog
          open={deleteConfirm.open}
          onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
          title={t("deleteConfirmTitle")}
          description={t("deleteConfirmDesc")}
          onConfirm={() => handleDeleteConfirm((id) => deleteEntry.mutate(id))}
          confirmLabel={tCommon("delete")}
          variant="destructive"
        />
      </div>
    </PullToRefresh>
  );
}
