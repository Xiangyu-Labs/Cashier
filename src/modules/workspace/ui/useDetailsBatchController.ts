"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useSelection } from "@/hooks/use-selection";
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
    try {
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
    } catch (error) {
      console.error("Failed to refresh details batch results", error);
      toast.warning(tCommon("savedRefreshFailed"));
    }
  }, [ledgerId, queryClient, tCommon]);

  const update = useMutation({
    mutationFn: (data: { categoryId?: string | null; currency?: string | null }) =>
      batchUpdateLedgerEntriesAction(ledgerId, selection.selectedIds, data),
    onSuccess: async (result) => {
      toast.success(t("batchUpdated", { count: result.affectedCount }));
      await invalidate();
      selection.clearSelection();
    },
    onError: () => toast.error(tCommon("error")),
  });
  const remove = useMutation({
    mutationFn: () => batchDeleteLedgerEntriesAction(ledgerId, selection.selectedIds),
    onSuccess: async (result) => {
      await invalidate();
      const unresolved = [...result.skipped, ...result.failed].map((item) => item.id);
      if (unresolved.length > 0) selection.retainSelection(unresolved);
      else selection.clearSelection();
      toast.success(t("batchDeleted", { count: result.succeededIds.length }));
      if (unresolved.length > 0) toast.warning(t("batchUnresolved", { count: unresolved.length }));
      setDeleteDialogOpen(false);
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
    onSuccess: async () => {
      toast.success(t("dateUpdated"));
      await invalidate();
      selection.clearSelection();
      setDateDialogOpen(false);
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
