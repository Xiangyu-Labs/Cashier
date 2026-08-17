"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useSelection } from "@/hooks/use-selection";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
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

  const update = useLedgerMutation<
    Awaited<ReturnType<typeof batchUpdateLedgerEntriesAction>>,
    { categoryId?: string | null; currency?: string | null }
  >(ledgerId, {
    mutationFn: (data: { categoryId?: string | null; currency?: string | null }) =>
      batchUpdateLedgerEntriesAction(ledgerId, selection.selectedIds, data),
    resourceGroups: ["entries"],
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
    mutationFn: () => previewBatchLedgerEntryDateAction(ledgerId, selection.selectedIds),
    onSuccess: (impact) => {
      setDateImpact(impact);
      setDateDialogOpen(true);
    },
    onError: () => toast.error(tCommon("error")),
  });
  const updateDates = useLedgerMutation<
    Awaited<ReturnType<typeof batchUpdateLedgerEntryDatesAction>>,
    void
  >(ledgerId, {
    mutationFn: () =>
      batchUpdateLedgerEntryDatesAction(ledgerId, selection.selectedIds, selectedDate),
    resourceGroups: ["entries"],
    errorMessage: tCommon("error"),
    onSuccess: () => {
      toast.success(t("dateUpdated"));
      selection.clearSelection();
      setDateDialogOpen(false);
    },
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
