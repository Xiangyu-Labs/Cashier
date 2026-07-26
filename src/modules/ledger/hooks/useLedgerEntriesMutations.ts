"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { useTranslations } from "next-intl";
import {
  invalidateCalendar,
  invalidateLedgerStats,
  invalidateSourceDocumentStreamTotal,
} from "@/lib/query-keys";
import { updateLedgerEntryAction, deleteLedgerEntryAction } from "@/modules/ledger/actions";
import type { DeleteLedgerEntryResultDto } from "@/modules/ledger/contracts";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";
import { getLedgerTransactionManager } from "@/lib/mutations/cache-transaction";
import {
  applyOptimisticUpsert,
  findSourceDocByEntryId,
} from "@/modules/source-document/hooks/source-document-optimistic-cache";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import type {
  MutationReconciliation,
} from "@/modules/source-document/contracts";
import { toast } from "sonner";

type SourceDocumentCacheEntry = Pick<
  LedgerEntryDto,
  | "id"
  | "itemName"
  | "description"
  | "amount"
  | "currency"
  | "categoryId"
  | "convertedAmount"
  | "exchangeRate"
> & {
  category?: EntryCategory | null;
};

type UpdateEntryResult = LedgerEntryDto & Partial<{ reconciliation: MutationReconciliation<SourceDocumentListItemDto> }>;
type DeleteEntryResult = DeleteLedgerEntryResultDto & Partial<{ reconciliation: MutationReconciliation<SourceDocumentListItemDto> }>;
type UpdateVariables = { ledgerEntryId: string; data: Partial<Omit<LedgerEntryDto, "amount">> & { amount?: number } };
type MutationContext = { operationId: string; found: boolean };

function getUpdatedCacheCategory(
  entry: SourceDocumentCacheEntry,
  categoryId: string | null | undefined,
  categories: EntryCategory[]
) {
  if (categoryId == null || categoryId === "") {
    return entry.category;
  }

  return categories.find((category) => category.id === categoryId) ?? entry.category;
}

function buildOptimisticCacheEntry(
  entry: SourceDocumentCacheEntry,
  data: Partial<Omit<LedgerEntryDto, "amount">> & { amount?: number },
  categories: EntryCategory[]
): SourceDocumentCacheEntry {
  const nextCategory = getUpdatedCacheCategory(entry, data.categoryId, categories);
  const updatedEntry: SourceDocumentCacheEntry = {
    ...entry,
    ...(data.itemName !== undefined ? { itemName: data.itemName } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.amount !== undefined ? { amount: String(data.amount) } : {}),
    ...(data.currency !== undefined ? { currency: data.currency } : {}),
    ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
  };

  return nextCategory !== undefined ? { ...updatedEntry, category: nextCategory } : updatedEntry;
}

function patchSourceDocEntries(
  sourceDoc: SourceDocumentListItemDto,
  entryId: string,
  updater: (entry: SourceDocumentCacheEntry) => SourceDocumentCacheEntry,
  _categories: EntryCategory[]
): SourceDocumentListItemDto {
  if (!sourceDoc.ledgerEntries) return sourceDoc;
  return {
    ...sourceDoc,
    ledgerEntries: sourceDoc.ledgerEntries.map((entry) =>
      entry.id === entryId
        ? { ...entry, ...updater(entry as unknown as SourceDocumentCacheEntry) }
        : entry
    ),
  };
}

function removeEntryFromSourceDoc(
  sourceDoc: SourceDocumentListItemDto,
  entryId: string
): SourceDocumentListItemDto {
  if (!sourceDoc.ledgerEntries) return sourceDoc;
  return {
    ...sourceDoc,
    ledgerEntries: sourceDoc.ledgerEntries.filter((entry) => entry.id !== entryId),
  };
}

export function useLedgerEntriesMutations(ledgerId: string, categories: EntryCategory[]) {
  const queryClient = useQueryClient();
  // I4: Use module-level singleton to survive remounts
  const manager = getLedgerTransactionManager(ledgerId);
  const tCommon = useTranslations("Common");

  const updateEntry = useMutation<UpdateEntryResult, Error, UpdateVariables, MutationContext>({
    mutationFn: async ({ ledgerEntryId, data }) => {
      const operationId = crypto.randomUUID();
      return updateLedgerEntryAction(ledgerId, ledgerEntryId, data, operationId) as Promise<UpdateEntryResult>;
    },
    onMutate: async ({ ledgerEntryId, data }) => {
      const op = manager.startOperation(ledgerId);

      // Find the parent source doc in the stream cache and capture previous state
      const found = findSourceDocByEntryId(queryClient, ledgerId, ledgerEntryId);
      if (found != null) {
        const { sourceDoc } = found;

        // Build the updated source doc with modified entry
        const updatedSourceDoc = patchSourceDocEntries(
          sourceDoc,
          ledgerEntryId,
          (entry) => buildOptimisticCacheEntry(entry, data, categories),
          categories
        );

        // Record the patch for rollback with actual previous entity
        op.patches.push({
          type: "upsert",
          entityId: sourceDoc.id,
          entity: updatedSourceDoc,
          prevEntity: sourceDoc, // C3: store actual previous entity
        });

        // Apply optimistic update to stream cache
        applyOptimisticUpsert(queryClient, ledgerId, updatedSourceDoc);
      }

      return { operationId: op.operationId, found: found != null };
    },
    onSuccess: (_data, _variables, context) => {
      if (context == null) return;
      // I3: Pass real reconciliation data
      const data = _data as UpdateEntryResult;
      manager.commitOperation(
        context.operationId,
        data.reconciliation?.entity ?? null,
        queryClient
      );
    },
    onError: (_error, _variables, context) => {
      if (context == null) return;
      manager.rollbackOperation(context.operationId, queryClient);
      toast.error(tCommon("saveFailed"));
    },
    onSettled: (_data, _error, _variables) => {
      // Do NOT invalidate the Stream on success — reconciliation already patched it.
      // Invalidate expensive derived data that the action result cannot patch.
      queryClient.invalidateQueries({
        predicate: invalidateLedgerStats(ledgerId),
      });
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentStreamTotal(ledgerId),
      });
      queryClient.invalidateQueries({
        predicate: invalidateCalendar(ledgerId),
      });
    },
  });

  const deleteEntry = useMutation<DeleteEntryResult, Error, string, MutationContext>({
    mutationFn: async (ledgerEntryId) => {
      const operationId = crypto.randomUUID();
      return deleteLedgerEntryAction(ledgerId, ledgerEntryId, operationId) as Promise<DeleteEntryResult>;
    },
    onMutate: async (ledgerEntryId) => {
      const op = manager.startOperation(ledgerId);

      // Find the parent source doc in the stream cache and capture previous state
      const found = findSourceDocByEntryId(queryClient, ledgerId, ledgerEntryId);
      if (found != null) {
        const { sourceDoc } = found;

        // Build the updated source doc with entry removed
        const updatedSourceDoc = removeEntryFromSourceDoc(sourceDoc, ledgerEntryId);

        // Record the patch for rollback with actual previous entity
        op.patches.push({
          type: "upsert",
          entityId: sourceDoc.id,
          entity: updatedSourceDoc,
          prevEntity: sourceDoc, // C3: store actual previous entity
        });

        // Apply optimistic update to stream cache
        applyOptimisticUpsert(queryClient, ledgerId, updatedSourceDoc);
      }

      return { operationId: op.operationId, found: found != null };
    },
    onSuccess: (_data, _variables, context) => {
      if (context == null) return;
      manager.commitOperation(context.operationId, null, queryClient);
      toast.success(tCommon("deleteSuccess"));
    },
    onError: (_error, _variables, context) => {
      if (context == null) return;
      manager.rollbackOperation(context.operationId, queryClient);
      toast.error(tCommon("deleteFailed"));
    },
    onSettled: (_data, _error, _variables) => {
      queryClient.invalidateQueries({
        predicate: invalidateLedgerStats(ledgerId),
      });
      queryClient.invalidateQueries({
        predicate: invalidateSourceDocumentStreamTotal(ledgerId),
      });
      queryClient.invalidateQueries({
        predicate: invalidateCalendar(ledgerId),
      });
    },
  });

  return {
    updateEntry,
    deleteEntry,
  };
}
