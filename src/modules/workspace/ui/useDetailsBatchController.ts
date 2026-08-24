"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useSelection } from "@/hooks/use-selection";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { formatDateTimeForApi, getDateInTimezone } from "@/lib/date-utils";
import {
  batchDeleteLedgerEntriesAction,
  batchUpdateLedgerEntriesAction,
  batchUpdateLedgerEntryDatesAction,
  previewBatchLedgerEntryDateAction,
} from "@/modules/ledger/actions";

type BatchDateImpact = Awaited<ReturnType<typeof previewBatchLedgerEntryDateAction>>;

export function useDetailsBatchController(
  ledgerId: string,
  entryIds: readonly string[],
  queryFingerprint: string,
  timeZone?: string
) {
  const t = useTranslations("DetailsTab");
  const tCommon = useTranslations("Common");
  const allIds = useMemo(() => [...entryIds], [entryIds]);
  const selection = useSelection({ allIds, queryFingerprint });
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    () => getDateInTimezone(timeZone) ?? formatDateTimeForApi(new Date())
  );
  const [dateImpact, setDateImpact] = useState<BatchDateImpact | null>(null);
  const [dateSelectionSnapshot, setDateSelectionSnapshot] = useState<{
    entryIds: string[];
    queryFingerprint: string;
    impact: BatchDateImpact;
  } | null>(null);
  const setDateDialogVisibility = useCallback((open: boolean) => {
    setDateDialogOpen(open);
    if (!open) {
      setDateImpact(null);
      setDateSelectionSnapshot(null);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.batchSelection = String(selection.isSelectionMode);
    return () => {
      delete document.documentElement.dataset.batchSelection;
    };
  }, [selection.isSelectionMode]);

  const update = useLedgerMutation<
    Awaited<ReturnType<typeof batchUpdateLedgerEntriesAction>>,
    { categoryId?: string | null; currency?: string | null }
  >(ledgerId, {
    mutationFn: (data: { categoryId?: string | null; currency?: string | null }) =>
      batchUpdateLedgerEntriesAction(ledgerId, selection.selectedIds, data),
    resourceGroups: ["entries"],
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    errorMessage: tCommon("error"),
    onSuccess: (result) => {
      toast.success(t("batchUpdated", { count: result.affectedCount }));
      selection.clearSelection();
    },
  });
  const remove = useLedgerMutation<
    Awaited<ReturnType<typeof batchDeleteLedgerEntriesAction>>,
    void
  >(ledgerId, {
    mutationFn: () => batchDeleteLedgerEntriesAction(ledgerId, selection.selectedIds),
    resourceGroups: ["entries"],
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    errorMessage: tCommon("deleteFailed"),
    onSuccess: (result) => {
      const unresolved = [...result.skipped, ...result.failed].map((item) => item.id);
      if (unresolved.length > 0) selection.retainSelection(unresolved);
      else selection.clearSelection();
      toast.success(t("batchDeleted", { count: result.succeededIds.length }));
      if (unresolved.length > 0) toast.warning(t("batchUnresolved", { count: unresolved.length }));
      setDeleteDialogOpen(false);
    },
  });
  const previewDate = useMutation({
    mutationFn: async () => {
      const snapshotEntryIds = [...selection.selectedIds];
      const impact = await previewBatchLedgerEntryDateAction(ledgerId, snapshotEntryIds);
      return { entryIds: snapshotEntryIds, impact };
    },
    onSuccess: ({ entryIds: snapshotEntryIds, impact }) => {
      setDateImpact(impact);
      setDateSelectionSnapshot({ entryIds: snapshotEntryIds, queryFingerprint, impact });
      setDateDialogVisibility(true);
    },
    onError: () => toast.error(tCommon("error")),
  });
  const updateDates = useLedgerMutation<
    Awaited<ReturnType<typeof batchUpdateLedgerEntryDatesAction>>,
    void
  >(ledgerId, {
    mutationFn: () => {
      const snapshot = dateSelectionSnapshot;
      if (
        snapshot == null ||
        snapshot.queryFingerprint !== queryFingerprint ||
        snapshot.entryIds.length !== selection.selectedIds.length ||
        snapshot.entryIds.some((id, index) => id !== selection.selectedIds[index])
      ) {
        throw new Error("selection_changed");
      }
      return batchUpdateLedgerEntryDatesAction(ledgerId, snapshot.entryIds, selectedDate);
    },
    resourceGroups: ["entries"],
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    errorMessage: t("selectionChanged"),
    onSuccess: () => {
      toast.success(t("dateUpdated"));
      selection.clearSelection();
      setDateDialogVisibility(false);
    },
  });

  return {
    ...selection,
    dateDialogOpen,
    setDateDialogOpen: setDateDialogVisibility,
    deleteDialogOpen,
    setDeleteDialogOpen,
    selectedDate,
    setSelectedDate,
    dateImpact,
    dateSelectionSnapshot,
    update,
    remove,
    previewDate,
    updateDates,
    isPending:
      update.isPending || remove.isPending || previewDate.isPending || updateDates.isPending,
  };
}
