"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import type { useTranslations } from "next-intl";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type {
  SourceDocument,
  SourceDocumentLight,
  SplitSourceDocumentInput,
  SplitSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import { openLedgerDetail } from "@/lib/navigation/ledger-detail-navigation";
import type { AddEntryData } from "./useSourceDocumentDetailMutations";

interface UseSourceDocumentEntryActionsOptions {
  ledgerId: string;
  sourceDocument: SourceDocument | SourceDocumentLight | null;
  busy: boolean;
  interactionDisabled: boolean;
  selectedIds: string[];
  ledgerEntries: LedgerEntry[];
  setIsSaving: (saving: boolean) => void;
  setIsSplitting: (splitting: boolean) => void;
  setIsDeleting: (deleting: boolean) => void;
  setShowSplitDialog: (open: boolean) => void;
  setShowAddEntryDialog: (open: boolean) => void;
  setPendingDeleteEntryId: (entryId: string | null) => void;
  clearSelection: () => void;
  onSplit?:
    | ((
        input: Omit<SplitSourceDocumentInput, "sourceDocumentId">
      ) => Promise<SplitSourceDocumentResultDto>)
    | undefined;
  onAddEntry?: ((data: AddEntryData) => Promise<unknown>) | undefined;
  onDeleteEntry?: ((entryId: string) => Promise<unknown>) | undefined;
  onDelete?: (() => void | Promise<void>) | undefined;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}

/** Owns splitting entries into a new document, adding/deleting a single entry, and deleting the document. */
export function useSourceDocumentEntryActions({
  ledgerId,
  sourceDocument,
  busy,
  interactionDisabled,
  selectedIds,
  ledgerEntries,
  setIsSaving,
  setIsSplitting,
  setIsDeleting,
  setShowSplitDialog,
  setShowAddEntryDialog,
  setPendingDeleteEntryId,
  clearSelection,
  onSplit,
  onAddEntry,
  onDeleteEntry,
  onDelete,
  t,
  tCommon,
}: UseSourceDocumentEntryActionsOptions) {
  const splitIdentityRef = useRef<{
    operationId: string;
    newSourceDocumentId: string;
    payloadKey: string;
  } | null>(null);

  const handleOpenSplit = useCallback(() => {
    if (busy || selectedIds.length === 0) return;
    if (selectedIds.length >= ledgerEntries.length) {
      toast.error(t("splitKeepOne"));
      return;
    }
    setShowSplitDialog(true);
  }, [busy, selectedIds, ledgerEntries.length, t, setShowSplitDialog]);

  const handleSplit = useCallback(
    async (entryDate: string) => {
      const expectedRevisionId = sourceDocument?.activeRevisionId;
      if (expectedRevisionId == null || expectedRevisionId === "" || onSplit == null) {
        toast.error(t("splitFailed"));
        return;
      }
      const payloadKey = JSON.stringify({
        expectedRevisionId,
        ledgerEntryIds: [...selectedIds].sort(),
        entryDate,
      });
      if (splitIdentityRef.current?.payloadKey !== payloadKey) {
        splitIdentityRef.current = {
          operationId: crypto.randomUUID(),
          newSourceDocumentId: crypto.randomUUID(),
          payloadKey,
        };
      }
      setIsSplitting(true);
      try {
        const result = await onSplit({
          expectedRevisionId,
          operationId: splitIdentityRef.current.operationId,
          newSourceDocumentId: splitIdentityRef.current.newSourceDocumentId,
          ledgerEntryIds: selectedIds,
          entryDate,
        });
        splitIdentityRef.current = null;
        setShowSplitDialog(false);
        clearSelection();
        toast.success(t("splitSuccess", { count: result.movedEntryCount }), {
          action: {
            label: t("viewSplitBill"),
            onClick: () =>
              openLedgerDetail({
                type: "source-document",
                id: result.splitSourceDocumentId,
                ledgerId,
              }),
          },
        });
      } catch {
        toast.error(t("splitFailed"));
      } finally {
        setIsSplitting(false);
      }
    },
    [
      sourceDocument?.activeRevisionId,
      onSplit,
      t,
      selectedIds,
      setIsSplitting,
      setShowSplitDialog,
      clearSelection,
      ledgerId,
    ]
  );

  const handleOpenAddEntry = useCallback(
    () => setShowAddEntryDialog(true),
    [setShowAddEntryDialog]
  );

  const handleAddEntrySubmit = useCallback(
    async (data: AddEntryData): Promise<boolean> => {
      if (onAddEntry == null || busy) return false;
      setIsSaving(true);
      try {
        await onAddEntry(data);
        toast.success(t("addEntrySuccess"));
        return true;
      } catch {
        toast.error(t("addEntryError"));
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [onAddEntry, busy, setIsSaving, t]
  );

  const handleDeleteEntry = useCallback(
    async (entryId: string): Promise<boolean> => {
      if (onDeleteEntry == null || busy) return false;
      setIsSaving(true);
      try {
        await onDeleteEntry(entryId);
        toast.success(tCommon("deleteSuccess"));
        return true;
      } catch {
        toast.error(tCommon("deleteFailed"));
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [onDeleteEntry, busy, setIsSaving, tCommon]
  );

  const handleRequestDeleteEntry = useCallback(
    (entryId: string) => setPendingDeleteEntryId(entryId),
    [setPendingDeleteEntryId]
  );

  const handleDeleteDocument = useCallback(async () => {
    if (interactionDisabled) return;
    setIsDeleting(true);
    try {
      await onDelete?.();
    } finally {
      setIsDeleting(false);
    }
  }, [interactionDisabled, setIsDeleting, onDelete]);

  return {
    handleOpenSplit,
    handleSplit,
    handleOpenAddEntry,
    handleAddEntrySubmit,
    handleDeleteEntry,
    handleRequestDeleteEntry,
    handleDeleteDocument,
  };
}
