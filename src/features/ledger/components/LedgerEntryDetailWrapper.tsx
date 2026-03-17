"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getLedgerEntryAction } from "@/features/ledger/server/actions/get-entry";
import {
  updateLedgerEntryAction,
  deleteLedgerEntryAction,
} from "@/features/ledger/server/actions/entries";
import { LedgerEntryDetailModal } from "./LedgerEntryDetailModal";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useLedgerMutation, createListSnapshots } from "@/lib/mutations/use-ledger-mutation";

import type { EntryCategory, LedgerEntry } from "@/types/api";

interface LedgerEntryDetailWrapperProps {
  id: string;
  open: boolean;
  onClose: () => void;
  categories: EntryCategory[];
}

export function LedgerEntryDetailWrapper({
  id,
  open,
  onClose,
  categories,
}: LedgerEntryDetailWrapperProps) {
  const tCommon = useTranslations("Common");
  const push = useModalStackStore((state) => state.push);

  const {
    data: ledgerEntry,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.ledgerEntry(id),
    queryFn: () => getLedgerEntryAction(id),
    enabled: open && id !== "",
    retry: false,
  });

  const ledgerId = ledgerEntry?.ledgerId;

  const updateMutation = useLedgerMutation<
    void,
    Partial<Omit<LedgerEntry, "amount">> & { amount?: number }
  >(ledgerId, {
    mutationFn: async (data) => {
      if (ledgerId == null || ledgerId === "") return;
      await updateLedgerEntryAction(ledgerId, id, data);
    },
    errorMessage: tCommon("saveFailed"),
    onOptimisticUpdate: (queryClient, data) => {
      const snapshotKey = queryKeys.ledgerEntry(id);
      const snapshots = createListSnapshots(queryClient, snapshotKey);

      queryClient.setQueriesData({ queryKey: snapshotKey }, (old: unknown) => {
        if (old == null) return old;
        return { ...old, ...data };
      });

      return { snapshots };
    },
  });

  const deleteMutation = useLedgerMutation<void, void>(ledgerId, {
    mutationFn: async () => {
      if (ledgerId == null || ledgerId === "") return;
      await deleteLedgerEntryAction(ledgerId, id);
    },
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    onSuccessExtra: () => {
      onClose();
    },
    onOptimisticUpdate: (queryClient) => {
      const snapshotKey = queryKeys.ledgerEntry(id);
      const snapshots = createListSnapshots(queryClient, snapshotKey);

      // Optimistically remove the entry by setting data to undefined
      queryClient.setQueriesData({ queryKey: snapshotKey }, () => undefined);

      return { snapshots };
    },
  });

  // Handle error state - moved to useEffect to avoid render-path side effects
  useEffect(() => {
    if (error) {
      toast.error(tCommon("error"));
      onClose();
    }
  }, [error, onClose, tCommon]);

  // Handle deleted/not-found case - moved to useEffect
  useEffect(() => {
    if (!isLoading && !ledgerEntry && open) {
      onClose();
    }
  }, [isLoading, ledgerEntry, open, onClose]);

  // Always render Modal - pass isLoading for skeleton state
  return (
    <LedgerEntryDetailModal
      ledgerEntry={ledgerEntry ?? null}
      isLoading={isLoading}
      categories={categories}
      open={open}
      onClose={onClose}
      onUpdate={async (data) => await updateMutation.mutateAsync(data)}
      onDelete={async () => await deleteMutation.mutateAsync()}
      onViewSourceDocument={
        ledgerEntry?.sourceDocumentId != null && ledgerEntry.sourceDocumentId !== ""
          ? () =>
              push({
                type: "source-document",
                id: ledgerEntry.sourceDocumentId!,
              })
          : undefined
      }
    />
  );
}
