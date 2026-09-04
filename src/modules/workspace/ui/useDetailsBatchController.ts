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
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type { VersionedTarget } from "@/modules/source-document/contracts";
import { unwrapAtomicBatchCommandResult } from "@/modules/source-document/command-results";

type BatchDateImpact = Awaited<ReturnType<typeof previewBatchLedgerEntryDateAction>>;

export function useDetailsBatchController(
  ledgerId: string,
  entries: readonly LedgerEntry[],
  queryFingerprint: string,
  timeZone?: string
) {
  const t = useTranslations("DetailsTab");
  const tCommon = useTranslations("Common");
  const allIds = useMemo(() => entries.map((entry) => entry.id), [entries]);
  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const targetsFor = useCallback(
    (ids: readonly string[]): VersionedTarget[] => {
      const versions = new Map<string, number>();
      for (const id of ids) {
        const sourceDocument = entryById.get(id)?.sourceDocument;
        if (sourceDocument == null) throw new Error("Entry has no source document version");
        const previous = versions.get(sourceDocument.id);
        if (previous != null && previous !== sourceDocument.version) {
          throw new Error("Selected entries contain conflicting source document versions");
        }
        versions.set(sourceDocument.id, sourceDocument.version);
      }
      return [...versions]
        .map(([sourceDocumentId, expectedVersion]) => ({ sourceDocumentId, expectedVersion }))
        .sort((left, right) => left.sourceDocumentId.localeCompare(right.sourceDocumentId));
    },
    [entryById]
  );
  const selection = useSelection({ allIds, queryFingerprint });
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    () => getDateInTimezone(timeZone) ?? formatDateTimeForApi(new Date())
  );
  const [dateImpact, setDateImpact] = useState<BatchDateImpact | null>(null);
  const [dateSelectionSnapshot, setDateSelectionSnapshot] = useState<{
    entryIds: string[];
    targets: VersionedTarget[];
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
    { ledgerEntryIds: string[]; affectedCount: number },
    { categoryId?: string | null; currency?: string | null }
  >(ledgerId, {
    mutationFn: async (data: { categoryId?: string | null; currency?: string | null }) => {
      const result = await batchUpdateLedgerEntriesAction(
        ledgerId,
        targetsFor(selection.selectedIds),
        selection.selectedIds,
        data
      );
      return unwrapAtomicBatchCommandResult(result);
    },
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    errorMessage: tCommon("error"),
    onSuccess: (result) => {
      if (result.affectedCount > 0)
        toast.success(t("batchUpdated", { count: result.affectedCount }));
      selection.clearSelection();
    },
  });
  const remove = useLedgerMutation<
    Awaited<ReturnType<typeof batchDeleteLedgerEntriesAction>>,
    void
  >(ledgerId, {
    mutationFn: () =>
      batchDeleteLedgerEntriesAction(
        ledgerId,
        targetsFor(selection.selectedIds),
        selection.selectedIds
      ),
    invalidationErrorMessage: tCommon("savedRefreshFailed"),
    errorMessage: tCommon("deleteFailed"),
    onSuccess: (result) => {
      const unresolved = [...result.stale, ...result.failed].map((item) => item.id);
      if (unresolved.length > 0) selection.retainSelection(unresolved);
      else selection.clearSelection();
      if (result.succeeded.length > 0)
        toast.success(t("batchDeleted", { count: result.succeeded.length }));
      if (unresolved.length > 0) toast.warning(t("batchUnresolved", { count: unresolved.length }));
      setDeleteDialogOpen(false);
    },
  });
  const previewDate = useMutation({
    mutationFn: async () => {
      const snapshotEntryIds = [...selection.selectedIds];
      const impact = await previewBatchLedgerEntryDateAction(ledgerId, snapshotEntryIds);
      return { entryIds: snapshotEntryIds, targets: targetsFor(snapshotEntryIds), impact };
    },
    onSuccess: ({ entryIds: snapshotEntryIds, targets, impact }) => {
      setDateImpact(impact);
      setDateSelectionSnapshot({ entryIds: snapshotEntryIds, targets, queryFingerprint, impact });
      setDateDialogVisibility(true);
    },
    onError: () => toast.error(tCommon("error")),
  });
  const updateDates = useLedgerMutation<{ impact: BatchDateImpact }, void>(ledgerId, {
    mutationFn: async () => {
      const snapshot = dateSelectionSnapshot;
      if (
        snapshot == null ||
        snapshot.queryFingerprint !== queryFingerprint ||
        snapshot.entryIds.length !== selection.selectedIds.length ||
        snapshot.entryIds.some((id, index) => id !== selection.selectedIds[index])
      ) {
        throw new Error("selection_changed");
      }
      const result = await batchUpdateLedgerEntryDatesAction(
        ledgerId,
        snapshot.targets,
        snapshot.entryIds,
        selectedDate
      );
      return unwrapAtomicBatchCommandResult(result);
    },
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
