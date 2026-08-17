"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useSelection } from "@/hooks/use-selection";
import { runBackgroundQueryRefresh } from "@/lib/mutations/background-query-refresh";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
} from "@/lib/query-keys";
import {
  batchDeleteLedgerEntriesAction,
  batchUpdateLedgerEntriesAction,
  batchUpdateLedgerEntryDatesAction,
  previewBatchLedgerEntryDateAction,
} from "@/modules/ledger/server-actions/entries";

export function useDetailsBatchController(
  ledgerId: string,
  entryIds: readonly string[],
  queryFingerprint: string
) {
  const t = useTranslations("DetailsTab");
  const tCommon = useTranslations("Common");
  const queryClient = useQueryClient();
  const allIds = useMemo(() => [...entryIds], [entryIds]);
  const selection = useSelection({ allIds, queryFingerprint });
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateImpact, setDateImpact] = useState<Awaited<
    ReturnType<typeof previewBatchLedgerEntryDateAction>
  > | null>(null);

  useEffect(() => {
    document.documentElement.dataset.batchSelection = String(selection.isSelectionMode);
    return () => {
      delete document.documentElement.dataset.batchSelection;
    };
  }, [selection.isSelectionMode]);

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries(
        { predicate: invalidateLedgerEntries(ledgerId) },
        { throwOnError: true }
      ),
      queryClient.invalidateQueries(
        { predicate: invalidateLedgerStats(ledgerId) },
        { throwOnError: true }
      ),
      queryClient.invalidateQueries(
        { predicate: invalidateSourceDocuments(ledgerId) },
        { throwOnError: true }
      ),
      queryClient.invalidateQueries(
        { predicate: invalidateCalendar(ledgerId) },
        { throwOnError: true }
      ),
    ]);
  }, [ledgerId, queryClient]);

  const refreshDerivedQueries = useCallback(
    (label: string) => {
      runBackgroundQueryRefresh({
        ledgerId,
        label,
        failureMessage: tCommon("savedRefreshFailed"),
        failureMode: "log-only",
        refresh: invalidate,
      });
    },
    [invalidate, ledgerId, tCommon]
  );

  const update = useMutation({
    mutationFn: (data: { categoryId?: string | null; currency?: string | null }) =>
      batchUpdateLedgerEntriesAction(ledgerId, selection.selectedIds, data),
    onSuccess: (result) => {
      toast.success(t("batchUpdated", { count: result.affectedCount }));
      selection.clearSelection();
      refreshDerivedQueries("details batch update refresh");
    },
    onError: () => toast.error(tCommon("error")),
  });
  const remove = useMutation({
    mutationFn: () => batchDeleteLedgerEntriesAction(ledgerId, selection.selectedIds),
    onSuccess: (result) => {
      const unresolved = [...result.skipped, ...result.failed].map((item) => item.id);
      if (unresolved.length > 0) selection.retainSelection(unresolved);
      else selection.clearSelection();
      toast.success(t("batchDeleted", { count: result.succeededIds.length }));
      if (unresolved.length > 0) toast.warning(t("batchUnresolved", { count: unresolved.length }));
      setDeleteDialogOpen(false);
      refreshDerivedQueries("details batch delete refresh");
    },
    onError: () => toast.error(tCommon("deleteFailed")),
  });
  const previewDate = useMutation({
    mutationFn: () => previewBatchLedgerEntryDateAction(ledgerId, selection.selectedIds),
    onSuccess: (impact) => {
      setDateImpact(impact);
      setDateDialogOpen(true);
    },
    onError: () => toast.error(tCommon("error")),
  });
  const updateDates = useMutation({
    mutationFn: () =>
      batchUpdateLedgerEntryDatesAction(ledgerId, selection.selectedIds, selectedDate),
    onSuccess: () => {
      toast.success(t("dateUpdated"));
      selection.clearSelection();
      setDateDialogOpen(false);
      refreshDerivedQueries("details batch date refresh");
    },
    onError: () => toast.error(tCommon("error")),
  });

  return {
    ...selection,
    dateDialogOpen,
    setDateDialogOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    selectedDate,
    setSelectedDate,
    dateImpact,
    update,
    remove,
    previewDate,
    updateDates,
    isPending:
      update.isPending || remove.isPending || previewDate.isPending || updateDates.isPending,
  };
}
