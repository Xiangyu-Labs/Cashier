"use client";
import { type QueryClient } from "@tanstack/react-query";
import {
  deleteSourceDocumentAction,
  updateSourceDocumentAction,
  updateSourceDocumentImagesAction,
} from "@/modules/source-document/actions";
import { queryKeys } from "@/lib/query-keys";
import { fireAndForget } from "@/lib/safe-async";
import { useLedgerMutation } from "@/lib/mutations/use-ledger-mutation";
import { useTranslations } from "next-intl";
import {
  createSourceDocSnapshots,
  type SourceDocumentLightQueryData,
  type SourceDocumentQueryData,
  updatePaginatedSourceDocumentLists,
} from "./source-document-detail-cache";

type QueryPredicate = (query: { queryKey: readonly unknown[] }) => boolean;

interface UseSourceDocumentRecordMutationsOptions {
  id: string;
  ledgerId: string | undefined;
  onClose: () => void;
  sourceDocumentPredicates: QueryPredicate[] | null;
  sourceDocumentSummaryPredicates: QueryPredicate[] | null;
  sourceDocumentEntriesSummaryPredicates: QueryPredicate[] | null;
}

function invalidateDetailAndLight(queryClient: QueryClient, id: string) {
  fireAndForget(queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocument(id) }), {
    context: "SourceDocumentDetailWrapper",
  });
  fireAndForget(queryClient.invalidateQueries({ queryKey: queryKeys.sourceDocumentLight(id) }), {
    context: "SourceDocumentDetailWrapper",
  });
}

export function useSourceDocumentRecordMutations({
  id,
  ledgerId,
  onClose,
  sourceDocumentPredicates,
  sourceDocumentSummaryPredicates,
  sourceDocumentEntriesSummaryPredicates,
}: UseSourceDocumentRecordMutationsOptions) {
  const tCommon = useTranslations("Common");

  const updateSourceDocMutation = useLedgerMutation<void, { title?: string; entryDate?: string }>(
    ledgerId,
    {
      mutationFn: async (data) => {
        if (ledgerId == null || ledgerId === "") return;
        await updateSourceDocumentAction(ledgerId, id, data);
      },
      errorMessage: tCommon("saveFailed"),
      ...(sourceDocumentPredicates !== null ? { cancelPredicates: sourceDocumentPredicates } : {}),
      ...(sourceDocumentSummaryPredicates !== null
        ? { invalidatePredicates: sourceDocumentSummaryPredicates }
        : {}),
      onOptimisticUpdate: (queryClient, data) => {
        const snapshots = createSourceDocSnapshots(queryClient, id, ledgerId);

        queryClient.setQueriesData(
          { queryKey: queryKeys.sourceDocument(id) },
          (old: SourceDocumentQueryData | undefined) => (old ? { ...old, ...data } : old)
        );
        queryClient.setQueriesData(
          { queryKey: queryKeys.sourceDocumentLight(id) },
          (old: SourceDocumentLightQueryData | undefined) => (old ? { ...old, ...data } : old)
        );

        if (ledgerId != null && ledgerId !== "") {
          updatePaginatedSourceDocumentLists(queryClient, ledgerId, (doc) =>
            doc.id === id ? { ...doc, ...data } : doc
          );
        }

        return { snapshots };
      },
      onSettledExtra: (queryClient) => invalidateDetailAndLight(queryClient, id),
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
    ...(sourceDocumentPredicates !== null ? { cancelPredicates: sourceDocumentPredicates } : {}),
    ...(sourceDocumentSummaryPredicates !== null
      ? { invalidatePredicates: sourceDocumentSummaryPredicates }
      : {}),
    onOptimisticUpdate: (queryClient, { images }) => {
      const snapshots = createSourceDocSnapshots(queryClient, id, ledgerId);
      const nextImageUrls = images.map((image) => image.data);

      queryClient.setQueriesData(
        { queryKey: queryKeys.sourceDocument(id) },
        (old: SourceDocumentQueryData | undefined) =>
          old ? { ...old, imageUrls: nextImageUrls } : old
      );
      queryClient.setQueriesData(
        { queryKey: queryKeys.sourceDocumentLight(id) },
        (old: SourceDocumentLightQueryData | undefined) =>
          old ? { ...old, hasImages: nextImageUrls.length > 0 } : old
      );

      if (ledgerId != null && ledgerId !== "") {
        updatePaginatedSourceDocumentLists(queryClient, ledgerId, (doc) =>
          doc.id === id
            ? {
                ...doc,
                imageUrls: [],
                hasImages: nextImageUrls.length > 0,
              }
            : doc
        );
      }

      return { snapshots };
    },
    onSettledExtra: (queryClient) => invalidateDetailAndLight(queryClient, id),
  });

  const deleteDocumentMutation = useLedgerMutation<void, void>(ledgerId, {
    mutationFn: async () => {
      if (ledgerId == null || ledgerId === "") return;
      await deleteSourceDocumentAction(ledgerId, id);
    },
    successMessage: tCommon("deleteSuccess"),
    errorMessage: tCommon("deleteFailed"),
    ...(sourceDocumentPredicates !== null ? { cancelPredicates: sourceDocumentPredicates } : {}),
    ...(sourceDocumentEntriesSummaryPredicates !== null
      ? { invalidatePredicates: sourceDocumentEntriesSummaryPredicates }
      : {}),
    onSuccessExtra: () => onClose(),
    onOptimisticUpdate: (queryClient) => {
      const snapshots = createSourceDocSnapshots(queryClient, id, ledgerId);

      queryClient.removeQueries({ queryKey: queryKeys.sourceDocument(id) });
      queryClient.removeQueries({ queryKey: queryKeys.sourceDocumentLight(id) });

      if (ledgerId != null && ledgerId !== "") {
        queryClient.setQueriesData(
          { queryKey: queryKeys.sourceDocuments(ledgerId, "all") },
          (old: { items: Array<{ id: string }>; total: number } | undefined) => {
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
    onSettledExtra: (queryClient) => invalidateDetailAndLight(queryClient, id),
  });

  return {
    updateSourceDocMutation,
    updateSourceDocImagesMutation,
    deleteDocumentMutation,
  };
}
