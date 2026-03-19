"use client";

import { type useQueryClient } from "@tanstack/react-query";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  queryKeys,
} from "@/lib/query-keys";
import {
  updateSourceDocumentAction,
  updateSourceDocumentImagesAction,
  deleteSourceDocumentAction,
  type SourceDocumentCollectionDto,
  type SourceDocumentWithEntries as ServerSourceDocumentWithEntries,
} from "@/modules/source-document/actions";
import {
  deleteLedgerEntryAction,
  batchUpdateLedgerEntriesAction,
  batchDeleteLedgerEntriesAction,
  updateLedgerEntryAction,
} from "@/modules/ledger/actions";
import { useTranslations } from "next-intl";
import { fireAndForget } from "@/lib/safe-async";
import {
  useLedgerMutation,
  createListSnapshots,
  type MutationSnapshot,
} from "@/lib/mutations/use-ledger-mutation";
import type { LedgerEntry } from "@/types/api";
import type { EntryEditData } from "@/modules/source-document/ui/entry-edit-data";
import type { SourceDocumentWithEntries } from "@/modules/source-document/actions";

type SourceDocumentQueryData = ServerSourceDocumentWithEntries;

function updatePaginatedSourceDocumentLists(
  queryClient: ReturnType<typeof useQueryClient>,
  ledgerId: string,
  updater: (doc: SourceDocumentWithEntries) => SourceDocumentWithEntries | null
) {
  queryClient.setQueriesData<SourceDocumentCollectionDto>(
    { queryKey: queryKeys.sourceDocuments(ledgerId, "all") },
    (old) => {
      if (!old) return old;

      const nextItems = old.items
        .map((doc) => updater(doc))
        .filter((doc): doc is SourceDocumentWithEntries => doc !== null);

      return {
        ...old,
        items: nextItems,
      };
    }
  );
}

function createSourceDocSnapshots(
  queryClient: ReturnType<typeof useQueryClient>,
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

interface UseSourceDocumentDetailMutationsOptions {
  id: string;
  ledgerId: string | undefined;
  onClose: () => void;
}

export function useSourceDocumentDetailMutations({
  id,
  ledgerId,
  onClose,
}: UseSourceDocumentDetailMutationsOptions) {
  const tCommon = useTranslations("Common");

  const updateSourceDocMutation = useLedgerMutation<void, { title?: string; entryDate?: string }>(
    ledgerId,
    {
      mutationFn: async (data) => {
        if (ledgerId == null || ledgerId === "") return;
        await updateSourceDocumentAction(ledgerId, id, data);
      },
      errorMessage: tCommon("saveFailed"),
      cancelPredicates:
        ledgerId != null && ledgerId !== "" ? [invalidateSourceDocuments(ledgerId)] : undefined,
      invalidatePredicates:
        ledgerId != null && ledgerId !== ""
          ? [
              invalidateSourceDocuments(ledgerId),
              invalidateLedgerStats(ledgerId),
              invalidateCalendar(ledgerId),
            ]
          : undefined,
      onOptimisticUpdate: (queryClient, data) => {
        const snapshots = createSourceDocSnapshots(queryClient, id, ledgerId);

        queryClient.setQueriesData(
          { queryKey: queryKeys.sourceDocument(id) },
          (old: SourceDocumentQueryData | undefined) => {
            if (!old) return old;
            return { ...old, ...data };
          }
        );

        queryClient.setQueriesData(
          { queryKey: queryKeys.sourceDocumentLight(id) },
          (old: SourceDocumentQueryData | undefined) => {
            if (!old) return old;
            return { ...old, ...data };
          }
        );

        if (ledgerId != null && ledgerId !== "") {
          updatePaginatedSourceDocumentLists(queryClient, ledgerId, (doc) =>
            doc.id === id ? { ...doc, ...data } : doc
          );
        }

        return { snapshots };
      },
      onSettledExtra: (queryClient) => {
        fireAndForget(queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }), {
          context: "SourceDocumentDetailWrapper",
        });
        fireAndForget(
          queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocumentLight(id) }),
          { context: "SourceDocumentDetailWrapper" }
        );
      },
    }
  );

  const updateSourceDocImagesMutation = useLedgerMutation<
    void,
    { images: { data: string; mimeType: string }[] }
  >(ledgerId, {
    mutationFn: async ({ images }) => {
      if (ledgerId == null || ledgerId === "") return;
      await updateSourceDocumentImagesAction(ledgerId, id, images);
    },
    successMessage: tCommon("saveSuccess"),
    errorMessage: tCommon("saveFailed"),
    cancelPredicates:
      ledgerId != null && ledgerId !== "" ? [invalidateSourceDocuments(ledgerId)] : undefined,
    invalidatePredicates:
      ledgerId != null && ledgerId !== ""
        ? [
            invalidateSourceDocuments(ledgerId),
            invalidateLedgerStats(ledgerId),
            invalidateCalendar(ledgerId),
          ]
        : undefined,
    onOptimisticUpdate: (queryClient, { images }) => {
      const snapshots = createSourceDocSnapshots(queryClient, id, ledgerId);
      const nextImageUrls = images.map((image) => image.data);

      queryClient.setQueriesData(
        { queryKey: queryKeys.sourceDocument(id) },
        (old: SourceDocumentQueryData | undefined) => {
          if (!old) return old;
          return { ...old, imageUrls: nextImageUrls };
        }
      );

      queryClient.setQueriesData(
        { queryKey: queryKeys.sourceDocumentLight(id) },
        (old: SourceDocumentQueryData | undefined) => {
          if (!old) return old;
          return { ...old, imageUrls: nextImageUrls };
        }
      );

      if (ledgerId != null && ledgerId !== "") {
        updatePaginatedSourceDocumentLists(queryClient, ledgerId, (doc) =>
          doc.id === id ? { ...doc, imageUrls: nextImageUrls } : doc
        );
      }

      return { snapshots };
    },
    onSettledExtra: (queryClient) => {
      fireAndForget(queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }), {
        context: "SourceDocumentDetailWrapper",
      });
      fireAndForget(
        queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocumentLight(id) }),
        { context: "SourceDocumentDetailWrapper" }
      );
    },
  });

  const updateEntryMutation = useLedgerMutation<
    void,
    { entryId: string; data: Partial<EntryEditData> }
  >(ledgerId, {
    mutationFn: async ({ entryId, data }) => {
      if (ledgerId == null || ledgerId === "") return;
      await updateLedgerEntryAction(ledgerId, entryId, {
        ...data,
        amount: data.amount !== undefined ? parseFloat(data.amount) : undefined,
      });
    },
    errorMessage: tCommon("saveFailed"),
    cancelPredicates:
      ledgerId != null && ledgerId !== ""
        ? [invalidateSourceDocuments(ledgerId), invalidateLedgerEntries(ledgerId)]
        : undefined,
    invalidatePredicates:
      ledgerId != null && ledgerId !== ""
        ? [
            invalidateSourceDocuments(ledgerId),
            invalidateLedgerEntries(ledgerId),
            invalidateLedgerStats(ledgerId),
            invalidateCalendar(ledgerId),
          ]
        : undefined,
    onOptimisticUpdate: (queryClient, { entryId, data }) => {
      const snapshots = createSourceDocSnapshots(queryClient, id, ledgerId);

      queryClient.setQueriesData(
        { queryKey: queryKeys.sourceDocument(id) },
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
          if (doc.id !== id) return doc;
          const updatedEntries =
            doc.ledgerEntries?.map((entry) =>
              entry.id === entryId ? { ...entry, ...data } : entry
            ) ?? [];
          return { ...doc, ledgerEntries: updatedEntries };
        });
      }

      return { snapshots };
    },
    onSettledExtra: (queryClient) => {
      fireAndForget(queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }), {
        context: "SourceDocumentDetailWrapper",
      });
    },
  });

  const batchUpdateMutation = useLedgerMutation<
    void,
    { ids: string[]; data: Partial<Omit<LedgerEntry, "amount">> & { amount?: number } }
  >(ledgerId, {
    mutationFn: async ({ ids, data }) => {
      if (ledgerId == null || ledgerId === "") return;
      await batchUpdateLedgerEntriesAction(ledgerId, ids, data);
    },
    errorMessage: tCommon("saveFailed"),
    cancelPredicates:
      ledgerId != null && ledgerId !== ""
        ? [invalidateSourceDocuments(ledgerId), invalidateLedgerEntries(ledgerId)]
        : undefined,
    invalidatePredicates:
      ledgerId != null && ledgerId !== ""
        ? [
            invalidateSourceDocuments(ledgerId),
            invalidateLedgerEntries(ledgerId),
            invalidateLedgerStats(ledgerId),
            invalidateCalendar(ledgerId),
          ]
        : undefined,
    onOptimisticUpdate: (queryClient, { ids, data }) => {
      const snapshots = createSourceDocSnapshots(queryClient, id, ledgerId);

      queryClient.setQueriesData(
        { queryKey: queryKeys.sourceDocument(id) },
        (old: SourceDocumentQueryData | undefined) => {
          if (!old?.ledgerEntries) return old;
          return {
            ...old,
            ledgerEntries: old.ledgerEntries.map((entry) =>
              ids.includes(entry.id) ? { ...entry, ...data } : entry
            ),
          };
        }
      );

      if (ledgerId != null && ledgerId !== "") {
        updatePaginatedSourceDocumentLists(queryClient, ledgerId, (doc) => {
          if (doc.id !== id) return doc;
          const updatedEntries =
            doc.ledgerEntries?.map((entry) =>
              ids.includes(entry.id) ? { ...entry, ...(data as Partial<typeof entry>) } : entry
            ) ?? [];
          return { ...doc, ledgerEntries: updatedEntries };
        });
      }

      return { snapshots };
    },
    onSettledExtra: (queryClient) => {
      fireAndForget(queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }), {
        context: "SourceDocumentDetailWrapper",
      });
    },
  });

  const deleteEntryMutation = useLedgerMutation<void, string>(ledgerId, {
    mutationFn: async (entryId) => {
      if (ledgerId == null || ledgerId === "") return;
      await deleteLedgerEntryAction(ledgerId, entryId);
    },
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    cancelPredicates:
      ledgerId != null && ledgerId !== ""
        ? [invalidateSourceDocuments(ledgerId), invalidateLedgerEntries(ledgerId)]
        : undefined,
    invalidatePredicates:
      ledgerId != null && ledgerId !== ""
        ? [
            invalidateSourceDocuments(ledgerId),
            invalidateLedgerEntries(ledgerId),
            invalidateLedgerStats(ledgerId),
            invalidateCalendar(ledgerId),
          ]
        : undefined,
    onOptimisticUpdate: (queryClient, entryId) => {
      const snapshots = createSourceDocSnapshots(queryClient, id, ledgerId);

      queryClient.setQueriesData(
        { queryKey: queryKeys.sourceDocument(id) },
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
          if (doc.id !== id) return doc;
          return {
            ...doc,
            ledgerEntries: doc.ledgerEntries?.filter((entry) => entry.id !== entryId) ?? [],
          };
        });
      }

      return { snapshots };
    },
    onSettledExtra: (queryClient) => {
      fireAndForget(queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }), {
        context: "SourceDocumentDetailWrapper",
      });
    },
  });

  const batchDeleteMutation = useLedgerMutation<void, string[]>(ledgerId, {
    mutationFn: async (ids) => {
      if (ledgerId == null || ledgerId === "") return;
      await batchDeleteLedgerEntriesAction(ledgerId, ids);
    },
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    cancelPredicates:
      ledgerId != null && ledgerId !== ""
        ? [invalidateSourceDocuments(ledgerId), invalidateLedgerEntries(ledgerId)]
        : undefined,
    invalidatePredicates:
      ledgerId != null && ledgerId !== ""
        ? [
            invalidateSourceDocuments(ledgerId),
            invalidateLedgerEntries(ledgerId),
            invalidateLedgerStats(ledgerId),
            invalidateCalendar(ledgerId),
          ]
        : undefined,
    onOptimisticUpdate: (queryClient, ids) => {
      const snapshots = createSourceDocSnapshots(queryClient, id, ledgerId);

      queryClient.setQueriesData(
        { queryKey: queryKeys.sourceDocument(id) },
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
          if (doc.id !== id) return doc;
          return {
            ...doc,
            ledgerEntries: doc.ledgerEntries?.filter((entry) => !ids.includes(entry.id)) ?? [],
          };
        });
      }

      return { snapshots };
    },
    onSettledExtra: (queryClient) => {
      fireAndForget(queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }), {
        context: "SourceDocumentDetailWrapper",
      });
    },
  });

  const deleteDocumentMutation = useLedgerMutation<void, void>(ledgerId, {
    mutationFn: async () => {
      if (ledgerId == null || ledgerId === "") return;
      await deleteSourceDocumentAction(ledgerId, id);
    },
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    cancelPredicates:
      ledgerId != null && ledgerId !== "" ? [invalidateSourceDocuments(ledgerId)] : undefined,
    invalidatePredicates:
      ledgerId != null && ledgerId !== ""
        ? [
            invalidateSourceDocuments(ledgerId),
            invalidateLedgerEntries(ledgerId),
            invalidateLedgerStats(ledgerId),
            invalidateCalendar(ledgerId),
          ]
        : undefined,
    onSuccessExtra: () => {
      onClose();
    },
    onOptimisticUpdate: (queryClient) => {
      const snapshots = createSourceDocSnapshots(queryClient, id, ledgerId);

      queryClient.setQueriesData({ queryKey: queryKeys.sourceDocument(id) }, () => undefined);

      if (ledgerId != null && ledgerId !== "") {
        queryClient.setQueriesData<SourceDocumentCollectionDto>(
          { queryKey: queryKeys.sourceDocuments(ledgerId, "all") },
          (old) => {
            if (!old) return old;
            return {
              ...old,
              items: old.items.filter((doc) => doc.id !== id),
              total: Math.max(0, old.total - 1),
            };
          }
        );
      }

      return { snapshots };
    },
    onSettledExtra: (queryClient) => {
      fireAndForget(queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }), {
        context: "SourceDocumentDetailWrapper",
      });
    },
  });

  return {
    updateSourceDoc: async (data: { title?: string; entryDate?: string }) =>
      updateSourceDocMutation.mutateAsync(data),
    updateImages: async (images: { data: string; mimeType: string }[]) =>
      updateSourceDocImagesMutation.mutateAsync({ images }),
    updateEntry: async (entryId: string, data: Partial<EntryEditData>) =>
      updateEntryMutation.mutateAsync({ entryId, data }),
    batchUpdate: async (
      ids: string[],
      data: Partial<Omit<LedgerEntry, "amount">> & { amount?: number }
    ) => batchUpdateMutation.mutateAsync({ ids, data }),
    deleteEntry: async (entryId: string) => deleteEntryMutation.mutateAsync(entryId),
    batchDelete: async (ids: string[]) => batchDeleteMutation.mutateAsync(ids),
    deleteDocument: async () => deleteDocumentMutation.mutateAsync(),
  };
}
