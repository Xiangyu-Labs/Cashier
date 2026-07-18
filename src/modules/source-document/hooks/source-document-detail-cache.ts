import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { createListSnapshots, type MutationSnapshot } from "@/lib/mutations/use-ledger-mutation";
import { round } from "@/lib/money/decimal";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import type {
  SourceDocumentAttentionDto,
  SourceDocumentCollectionDto,
  SourceDocumentCompletedPageDto,
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

function updateDetailDocumentEntries(
  queryClient: QueryClient,
  documentId: string,
  updater: (
    entries: NonNullable<SourceDocumentQueryData["ledgerEntries"]>
  ) => NonNullable<SourceDocumentQueryData["ledgerEntries"]>
) {
  queryClient.setQueriesData(
    { queryKey: queryKeys.sourceDocument(documentId) },
    (old: SourceDocumentQueryData | undefined) => {
      if (!old?.ledgerEntries) return old;
      return {
        ...old,
        ledgerEntries: updater(old.ledgerEntries),
      };
    }
  );
}

function updateLightDocumentEntries(
  queryClient: QueryClient,
  documentId: string,
  updater: (
    entries: SourceDocumentLightQueryData["ledgerEntries"]
  ) => SourceDocumentLightQueryData["ledgerEntries"]
) {
  queryClient.setQueriesData(
    { queryKey: queryKeys.sourceDocumentLight(documentId) },
    (old: SourceDocumentLightQueryData | undefined) => {
      if (!old?.ledgerEntries) return old;
      return {
        ...old,
        ledgerEntries: updater(old.ledgerEntries),
      };
    }
  );
}

export function updateSourceDocumentCollectionLists(
  queryClient: QueryClient,
  ledgerId: string,
  updater: (doc: SourceDocumentListItemWithEntries) => SourceDocumentListItemWithEntries | null
) {
  // Update any legacy collection caches (backward compat)
  queryClient.setQueriesData<SourceDocumentCollectionDto>(
    { queryKey: queryKeys.sourceDocumentCollectionPrefix(ledgerId) },
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

  // Update attention cache
  queryClient.setQueryData<SourceDocumentAttentionDto>(
    queryKeys.sourceDocumentAttention(ledgerId),
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

  // Update completed page caches (InfiniteData shape — C3)
  queryClient.setQueriesData<InfiniteData<SourceDocumentCompletedPageDto>>(
    { queryKey: queryKeys.sourceDocumentCompletedPage(ledgerId) },
    (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          items: page.items
            .map((doc) => updater(doc))
            .filter((doc): doc is SourceDocumentListItemWithEntries => doc !== null),
        })),
        pageParams: old.pageParams,
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
    snapshots.push(
      ...createListSnapshots(queryClient, queryKeys.sourceDocumentCollectionPrefix(ledgerId))
    );
    snapshots.push(
      ...createListSnapshots(queryClient, queryKeys.sourceDocumentAttention(ledgerId))
    );
    snapshots.push(
      ...createListSnapshots(queryClient, queryKeys.sourceDocumentCompletedPage(ledgerId))
    );
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
  if (data.amount !== undefined) patch.amount = round(String(data.amount), 2) as T["amount"];

  return { ...entry, ...patch };
}

export function updateSingleEntryInCaches(
  queryClient: QueryClient,
  documentId: string,
  ledgerId: string | undefined,
  entryId: string,
  data: Record<string, unknown>
) {
  updateDetailDocumentEntries(queryClient, documentId, (entries) =>
    entries.map((entry) => (entry.id === entryId ? { ...entry, ...data } : entry))
  );
  updateLightDocumentEntries(queryClient, documentId, (entries) =>
    entries.map((entry) => (entry.id === entryId ? { ...entry, ...data } : entry))
  );

  if (ledgerId != null && ledgerId !== "") {
    updateSourceDocumentCollectionLists(queryClient, ledgerId, (doc) => {
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
  updateDetailDocumentEntries(queryClient, documentId, (entries) =>
    entries.map((entry) => (ids.includes(entry.id) ? applyBatchEntryUpdate(entry, data) : entry))
  );
  updateLightDocumentEntries(queryClient, documentId, (entries) =>
    entries.map((entry) => (ids.includes(entry.id) ? applyBatchEntryUpdate(entry, data) : entry))
  );

  if (ledgerId != null && ledgerId !== "") {
    updateSourceDocumentCollectionLists(queryClient, ledgerId, (doc) => {
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
  updateDetailDocumentEntries(queryClient, documentId, (entries) =>
    entries.filter((entry) => entry.id !== entryId)
  );
  updateLightDocumentEntries(queryClient, documentId, (entries) =>
    entries.filter((entry) => entry.id !== entryId)
  );

  if (ledgerId != null && ledgerId !== "") {
    updateSourceDocumentCollectionLists(queryClient, ledgerId, (doc) => {
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
  updateDetailDocumentEntries(queryClient, documentId, (entries) =>
    entries.filter((entry) => !ids.includes(entry.id))
  );
  updateLightDocumentEntries(queryClient, documentId, (entries) =>
    entries.filter((entry) => !ids.includes(entry.id))
  );

  if (ledgerId != null && ledgerId !== "") {
    updateSourceDocumentCollectionLists(queryClient, ledgerId, (doc) => {
      if (doc.id !== documentId) return doc;
      return {
        ...doc,
        ledgerEntries: doc.ledgerEntries?.filter((entry) => !ids.includes(entry.id)) ?? [],
      };
    });
  }
}
