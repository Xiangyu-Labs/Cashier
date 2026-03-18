"use client";

import { useQuery, type useQueryClient } from "@tanstack/react-query";
import {
  invalidateCalendar,
  invalidateLedgerEntries,
  invalidateLedgerStats,
  invalidateSourceDocuments,
  queryKeys,
} from "@/lib/query-keys";
import { getSourceDocumentByIdAction } from "@/features/source-document/server/actions/get-document";
import { getSourceDocumentLightAction } from "@/features/source-document/server/actions/get-document-light";
import {
  updateSourceDocumentAction,
  deleteSourceDocumentAction,
} from "@/features/source-document/server/actions";
import {
  deleteLedgerEntryAction,
  batchUpdateLedgerEntriesAction,
  batchDeleteLedgerEntriesAction,
  updateLedgerEntryAction,
} from "@/features/ledger/server/actions/entries";
import { SourceDocumentDetailModal } from "./SourceDocumentDetailModal";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { fireAndForget } from "@/lib/safe-async";
import {
  useLedgerMutation,
  createListSnapshots,
  type MutationSnapshot,
} from "@/lib/mutations/use-ledger-mutation";
import type { SourceDocumentWithEntries } from "@/features/source-document/client/hooks/use-source-documents";
import type { PaginatedSourceDocumentsResponse } from "@/features/source-document/server/actions/types";

import type { EntryCategory, LedgerEntry, SourceDocument, SourceDocumentLight } from "@/types/api";
import type { EntryEditData } from "@/components/entries";
import type { SourceDocumentWithEntries as ServerSourceDocumentWithEntries } from "@/features/source-document/server/actions/get-document";

function updatePaginatedSourceDocumentLists(
  queryClient: ReturnType<typeof useQueryClient>,
  ledgerId: string,
  updater: (doc: SourceDocumentWithEntries) => SourceDocumentWithEntries | null
) {
  queryClient.setQueriesData<PaginatedSourceDocumentsResponse>(
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

// Helper function to create snapshots for source document mutations
// Reduces duplication across 6 mutations in this component
function createSourceDocSnapshots(
  queryClient: ReturnType<typeof useQueryClient>,
  documentId: string,
  ledgerId: string | undefined
): MutationSnapshot {
  const snapshots = createListSnapshots(queryClient, queryKeys.sourceDocument(documentId));
  snapshots.push(...createListSnapshots(queryClient, queryKeys.sourceDocumentLight(documentId)));

  if (ledgerId != null && ledgerId !== "") {
    const listKey = queryKeys.sourceDocuments(ledgerId, "all");
    const listSnapshots = createListSnapshots(queryClient, listKey);
    snapshots.push(...listSnapshots);
  }

  return snapshots;
}

// Use the server type for query data (they are compatible)
type SourceDocumentQueryData = ServerSourceDocumentWithEntries;

interface SourceDocumentDetailWrapperProps {
  id: string;
  open: boolean;
  onClose: () => void;
  categories: EntryCategory[];
  ledgerEntries?: LedgerEntry[];
}

export function SourceDocumentDetailWrapper({
  id,
  open,
  onClose,
  categories,
  ledgerEntries: initialLedgerEntries,
}: SourceDocumentDetailWrapperProps) {
  const tCommon = useTranslations("Common");

  // 1. Query light data (prefetched, likely to hit cache immediately)
  const { data: lightData, isLoading: isLoadingLight } = useQuery({
    queryKey: queryKeys.sourceDocumentLight(id),
    queryFn: () => getSourceDocumentLightAction(id),
    enabled: open && id !== "",
    staleTime: 5 * 60 * 1000,
  });

  // 2. Query full data (background loading for images)
  const { data: fullData, error } = useQuery({
    queryKey: queryKeys.sourceDocument(id),
    queryFn: () => getSourceDocumentByIdAction(id),
    enabled: open && id !== "",
    retry: false,
  });

  // 3. Merge data (prefer full data, fallback to light data)
  const sourceDocument = fullData ?? lightData ?? null;
  const isLoading = isLoadingLight && lightData == null; // Only show loading if light data is not available
  const isLoadingImages = fullData?.imageUrls == null; // Images only available in full data

  const ledgerId = sourceDocument?.ledgerId;

  // Update source document (title, entryDate)
  const updateSourceDocMutation = useLedgerMutation<void, { title?: string; entryDate?: string }>(
    ledgerId,
    {
      mutationFn: async (data) => {
        if (ledgerId == null || ledgerId === "") return;
        await updateSourceDocumentAction(ledgerId, id, data);
      },
      errorMessage: tCommon("saveFailed"),
      cancelPredicates: ledgerId ? [invalidateSourceDocuments(ledgerId)] : undefined,
      invalidatePredicates: ledgerId
        ? [
            invalidateSourceDocuments(ledgerId),
            invalidateLedgerStats(ledgerId),
            invalidateCalendar(ledgerId),
          ]
        : undefined,
      onOptimisticUpdate: (queryClient, data) => {
        const snapshots = createSourceDocSnapshots(queryClient, id, ledgerId);

        // 1. Update full detail query
        queryClient.setQueriesData(
          { queryKey: queryKeys.sourceDocument(id) },
          (old: SourceDocumentQueryData | undefined) => {
            if (!old) return old;
            return { ...old, ...data };
          }
        );

        // 2. Update light detail query (keep in sync)
        queryClient.setQueriesData(
          { queryKey: queryKeys.sourceDocumentLight(id) },
          (old: SourceDocumentQueryData | undefined) => {
            if (!old) return old;
            return { ...old, ...data };
          }
        );

        // 3. Update flat list cache (new architecture)
        if (ledgerId != null && ledgerId !== "") {
          updatePaginatedSourceDocumentLists(queryClient, ledgerId, (doc) =>
            doc.id === id ? { ...doc, ...data } : doc
          );
        }

        return { snapshots };
      },
      onSettledExtra: (queryClient) => {
        fireAndForget(
          queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }),
          { context: "SourceDocumentDetailWrapper" }
        );
        fireAndForget(
          queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocumentLight(id) }),
          { context: "SourceDocumentDetailWrapper" }
        );
      },
    }
  );

  // Update single entry
  const updateEntryMutation = useLedgerMutation<
    void,
    { entryId: string; data: Partial<EntryEditData> }
  >(ledgerId, {
    mutationFn: async ({ entryId, data }) => {
      if (ledgerId == null || ledgerId === "") return;
      const convertedData = {
        ...data,
        amount: data.amount !== undefined ? parseFloat(data.amount) : undefined,
      };
      await updateLedgerEntryAction(ledgerId, entryId, convertedData);
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

      // 1. Update detail query
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

      // 2. Update flat list cache (new architecture)
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
      fireAndForget(
        queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }),
        { context: "SourceDocumentDetailWrapper" }
      );
    },
  });

  // Batch update entries
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

      // 1. Update detail query
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

      // 2. Update flat list cache (new architecture)
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
      fireAndForget(
        queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }),
        { context: "SourceDocumentDetailWrapper" }
      );
    },
  });

  // Delete single entry
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

      // 1. Update detail query
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

      // 2. Update flat list cache (new architecture)
      if (ledgerId != null && ledgerId !== "") {
        updatePaginatedSourceDocumentLists(queryClient, ledgerId, (doc) => {
          if (doc.id !== id) return doc;
          const filteredEntries =
            doc.ledgerEntries?.filter((entry) => entry.id !== entryId) ?? [];
          return { ...doc, ledgerEntries: filteredEntries };
        });
      }

      return { snapshots };
    },
    onSettledExtra: (queryClient) => {
      fireAndForget(
        queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }),
        { context: "SourceDocumentDetailWrapper" }
      );
    },
  });

  // Batch delete entries
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

      // 1. Update detail query
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

      // 2. Update flat list cache (new architecture)
      if (ledgerId != null && ledgerId !== "") {
        updatePaginatedSourceDocumentLists(queryClient, ledgerId, (doc) => {
          if (doc.id !== id) return doc;
          const filteredEntries =
            doc.ledgerEntries?.filter((entry) => !ids.includes(entry.id)) ?? [];
          return { ...doc, ledgerEntries: filteredEntries };
        });
      }

      return { snapshots };
    },
    onSettledExtra: (queryClient) => {
      fireAndForget(
        queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }),
        { context: "SourceDocumentDetailWrapper" }
      );
    },
  });

  // Delete document
  const deleteDocumentMutation = useLedgerMutation<void, void>(ledgerId, {
    mutationFn: async () => {
      if (ledgerId == null || ledgerId === "") return;
      await deleteSourceDocumentAction(ledgerId, id);
    },
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    cancelPredicates: ledgerId ? [invalidateSourceDocuments(ledgerId)] : undefined,
    invalidatePredicates: ledgerId
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

      // 1. Remove from detail query
      queryClient.setQueriesData({ queryKey: queryKeys.sourceDocument(id) }, () => undefined);

      // 2. Remove from flat list cache (new architecture)
      if (ledgerId != null && ledgerId !== "") {
        queryClient.setQueriesData<PaginatedSourceDocumentsResponse>(
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
      fireAndForget(
        queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }),
        { context: "SourceDocumentDetailWrapper" }
      );
    },
  });

  // Handle error state - moved to useEffect to avoid render-path side effects
  useEffect(() => {
    if (error != null) {
      toast.error(tCommon("error"));
      onClose();
    }
  }, [error, onClose, tCommon]);

  // Handle deleted/not-found case - moved to useEffect
  useEffect(() => {
    if (!isLoading && sourceDocument == null && open) {
      onClose();
    }
  }, [isLoading, sourceDocument, open, onClose]);

  // Source document from query includes ledgerEntries directly
  const currentLedgerEntries = sourceDocument?.ledgerEntries ?? initialLedgerEntries ?? [];

  // Safe check for ledgerId
  const safeLedgerId = ledgerId ?? "";

  // Merge and normalize data for display (works with both light and full data)
  const safeSourceDocument: (SourceDocument | SourceDocumentLight) | null = sourceDocument
    ? {
        ...sourceDocument,
        status: sourceDocument.status ?? "queued",
        // Ensure type is never null (normalize to empty string)
        type: sourceDocument.type ?? "",
      }
    : null;

  return (
    <SourceDocumentDetailModal
      ledgerId={safeLedgerId}
      sourceDocument={safeSourceDocument}
      isLoading={isLoading}
      isLoadingImages={isLoadingImages}
      ledgerEntries={currentLedgerEntries}
      categories={categories}
      open={open}
      onClose={onClose}
      onUpdateSourceDoc={async (data) => await updateSourceDocMutation.mutateAsync(data)}
      onUpdateEntry={async (entryId, data) =>
        await updateEntryMutation.mutateAsync({ entryId, data })
      }
      onBatchUpdate={async (ids, data) => await batchUpdateMutation.mutateAsync({ ids, data })}
      onDeleteEntry={async (entryId) => await deleteEntryMutation.mutateAsync(entryId)}
      onBatchDelete={async (ids) => await batchDeleteMutation.mutateAsync(ids)}
      onDelete={async () => await deleteDocumentMutation.mutateAsync()}
    />
  );
}
