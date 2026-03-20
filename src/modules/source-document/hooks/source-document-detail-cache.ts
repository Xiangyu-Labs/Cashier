import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  createListSnapshots,
  type MutationSnapshot,
} from "@/lib/mutations/use-ledger-mutation";
import type { LedgerEntry } from "@/types/api";
import type {
  SourceDocumentCollectionDto,
  SourceDocumentDto,
  SourceDocumentLightWithEntriesDto,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";

export type SourceDocumentQueryData = SourceDocumentDto;
export type SourceDocumentLightQueryData = SourceDocumentLightWithEntriesDto;
export type SourceDocumentListItemWithEntries = SourceDocumentListItemDto;
export type BatchEntryUpdateData = Partial<Omit<LedgerEntry, "amount">> & {
  amount?: number;
};

export function updatePaginatedSourceDocumentLists(
  queryClient: QueryClient,
  ledgerId: string,
  updater: (doc: SourceDocumentListItemWithEntries) => SourceDocumentListItemWithEntries | null
) {
  queryClient.setQueriesData<SourceDocumentCollectionDto>(
    { queryKey: queryKeys.sourceDocuments(ledgerId, "all") },
    (old) => {
      if (!old) return old;
      const nextItems = old.items
        .map((doc) => updater(doc))
        .filter((doc): doc is SourceDocumentListItemWithEntries => doc !== null);
      return {
        ...old,
        items: nextItems,
      };
    }
  );
}

export function createSourceDocSnapshots(
  queryClient: QueryClient,
  documentId: string,
  ledgerId: string | undefined
): MutationSnapshot {
  const snapshots = createListSnapshots(queryClient, queryKeys.sourceDocument(documentId));
  snapshots.push(...createListSnapshots(queryClient, queryKeys.sourceDocumentLight(documentId)));

  if (ledgerId != null && ledgerId !== "") {
    snapshots.push(...createListSnapshots(queryClient, queryKeys.sourceDocuments(ledgerId, "all")));
  }

  return snapshots;
}

export function applyBatchEntryUpdate<
  T extends {
    categoryId: string | null;
    currency: string | null;
    itemName: string;
    description: string | null;
    amount: string;
  },
>(entry: T, data: BatchEntryUpdateData): T {
  const patch: Partial<T> = {};

  if (data.categoryId !== undefined) patch.categoryId = data.categoryId as T["categoryId"];
  if (data.currency !== undefined) patch.currency = data.currency as T["currency"];
  if (data.itemName !== undefined) patch.itemName = data.itemName as T["itemName"];
  if (data.description !== undefined) patch.description = data.description as T["description"];
  if (data.amount !== undefined) patch.amount = data.amount.toFixed(2) as T["amount"];

  return { ...entry, ...patch };
}

export function updateSingleEntryInCaches(
  queryClient: QueryClient,
  documentId: string,
  ledgerId: string | undefined,
  entryId: string,
  data: Record<string, unknown>
) {
  queryClient.setQueriesData(
    { queryKey: queryKeys.sourceDocument(documentId) },
    (old: SourceDocumentQueryData | undefined) => {
      if (!old?.ledgerEntries) return old;
      return {
        ...old,
        ledgerEntries: old.ledgerEntries.map((entry) =>
          entry.id === entryId ? { ...entry, ...data } : entry
        ),
      };
    }
  );

  if (ledgerId != null && ledgerId !== "") {
    updatePaginatedSourceDocumentLists(queryClient, ledgerId, (doc) => {
      if (doc.id !== documentId) return doc;
      return {
        ...doc,
        ledgerEntries:
          doc.ledgerEntries?.map((entry) =>
            entry.id === entryId ? { ...entry, ...data } : entry
          ) ?? [],
      };
    });
  }
}

export function updateBatchEntriesInCaches(
  queryClient: QueryClient,
  documentId: string,
  ledgerId: string | undefined,
  ids: string[],
  data: BatchEntryUpdateData
) {
  queryClient.setQueriesData(
    { queryKey: queryKeys.sourceDocument(documentId) },
    (old: SourceDocumentQueryData | undefined) => {
      if (!old?.ledgerEntries) return old;
      return {
        ...old,
        ledgerEntries: old.ledgerEntries.map((entry) =>
          ids.includes(entry.id) ? applyBatchEntryUpdate(entry, data) : entry
        ),
      };
    }
  );

  if (ledgerId != null && ledgerId !== "") {
    updatePaginatedSourceDocumentLists(queryClient, ledgerId, (doc) => {
      if (doc.id !== documentId) return doc;
      return {
        ...doc,
        ledgerEntries:
          doc.ledgerEntries?.map((entry) =>
            ids.includes(entry.id) ? applyBatchEntryUpdate(entry, data) : entry
          ) ?? [],
      };
    });
  }
}

export function removeSingleEntryFromCaches(
  queryClient: QueryClient,
  documentId: string,
  ledgerId: string | undefined,
  entryId: string
) {
  queryClient.setQueriesData(
    { queryKey: queryKeys.sourceDocument(documentId) },
    (old: SourceDocumentQueryData | undefined) => {
      if (!old?.ledgerEntries) return old;
      return {
        ...old,
        ledgerEntries: old.ledgerEntries.filter((entry) => entry.id !== entryId),
      };
    }
  );

  if (ledgerId != null && ledgerId !== "") {
    updatePaginatedSourceDocumentLists(queryClient, ledgerId, (doc) => {
      if (doc.id !== documentId) return doc;
      return {
        ...doc,
        ledgerEntries: doc.ledgerEntries?.filter((entry) => entry.id !== entryId) ?? [],
      };
    });
  }
}

export function removeBatchEntriesFromCaches(
  queryClient: QueryClient,
  documentId: string,
  ledgerId: string | undefined,
  ids: string[]
) {
  queryClient.setQueriesData(
    { queryKey: queryKeys.sourceDocument(documentId) },
    (old: SourceDocumentQueryData | undefined) => {
      if (!old?.ledgerEntries) return old;
      return {
        ...old,
        ledgerEntries: old.ledgerEntries.filter((entry) => !ids.includes(entry.id)),
      };
    }
  );

  if (ledgerId != null && ledgerId !== "") {
    updatePaginatedSourceDocumentLists(queryClient, ledgerId, (doc) => {
      if (doc.id !== documentId) return doc;
      return {
        ...doc,
        ledgerEntries: doc.ledgerEntries?.filter((entry) => !ids.includes(entry.id)) ?? [],
      };
    });
  }
}
