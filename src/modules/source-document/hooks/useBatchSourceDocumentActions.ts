"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  invalidateCalendar,
  invalidateLedgerStats,
  queryKeys,
} from "@/lib/query-keys";
import { getLedgerTransactionManager } from "@/lib/mutations/cache-transaction";
import {
  deleteSourceDocumentAction,
  batchUpdateSourceDocumentsAction,
} from "@/modules/source-document/actions";
import {
  applyOptimisticDelete,
  applyOptimisticUpsert,
  getStreamQueryMatches,
} from "@/modules/source-document/hooks/source-document-optimistic-cache";
import type { SourceDocumentListItemDto, StreamPage } from "@/modules/source-document/contracts";
import type { InfiniteData } from "@tanstack/react-query";

type DeleteContext = { operationId: string };
type BatchDatesContext = { operationId: string; ids: string[] };

export function useBatchSourceDocumentActions(ledgerId: string, clearSelection: () => void) {
  const queryClient = useQueryClient();
  // I4: Use module-level singleton to survive remounts
  const manager = getLedgerTransactionManager(ledgerId);
  const tCommon = useTranslations("Common");
  const tBatch = useTranslations("BatchActions");

  const deleteSourceDocument = useMutation<void, Error, string, DeleteContext>({
    mutationFn: async (id: string) => {
      const operationId = crypto.randomUUID();
      await deleteSourceDocumentAction(ledgerId, id, operationId);
    },
    onMutate: async (id) => {
      const op = manager.startOperation(ledgerId);

      // C3: Capture the current entity from stream cache for rollback
      const matches = getStreamQueryMatches(queryClient, ledgerId);
      let prevEntity: SourceDocumentListItemDto | null = null;

      for (const [, data] of matches) {
        if (!data) continue;
        for (const page of data.pages) {
          const found = page.items.find((item) => item.id === id);
          if (found) {
            prevEntity = found;
            break;
          }
        }
        if (prevEntity) break;
      }

      op.patches.push({
        type: "delete",
        entityId: id,
        entity: prevEntity ?? {
          id,
          ledgerId,
          title: null,
          text: null,
          files: [],
          status: "completed",
          type: "ai_parsed",
          anomalyReason: null,
          entryDate: null,
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          hasImages: false,
          supportedActions: [],
          errorCode: null,
          pendingRevisionId: null,
          ledgerEntries: [],
        } as SourceDocumentListItemDto,
        prevEntity, // C3: store actual previous entity for rollback
      });

      // Apply optimistic delete to stream cache
      applyOptimisticDelete(queryClient, ledgerId, id);

      return { operationId: op.operationId };
    },
    onSuccess: (_data, _variables, context) => {
      if (context == null) return;
      manager.commitOperation(context.operationId, null, queryClient);
      clearSelection();
    },
    onError: (_error, _variables, context) => {
      if (context == null) return;
      manager.rollbackOperation(context.operationId, queryClient);
      toast.error(tCommon("deleteFailed"));
    },
    onSettled: () => {
      // Targeted invalidation for derived data
      queryClient.invalidateQueries({
        predicate: invalidateLedgerStats(ledgerId),
      });
      queryClient.invalidateQueries({
        predicate: invalidateCalendar(ledgerId),
      });
    },
  });

  const batchUpdateDates = useMutation<void, Error, { ids: string[]; entryDate: string }, BatchDatesContext>({
    mutationFn: async ({ ids, entryDate }) => {
      const operationId = crypto.randomUUID();
      await batchUpdateSourceDocumentsAction(ledgerId, ids, { entryDate });
    },
    onMutate: async ({ ids, entryDate }) => {
      const op = manager.startOperation(ledgerId);

      // Apply optimistic date updates to all affected source docs in stream cache
      const matches = getStreamQueryMatches(queryClient, ledgerId);

      for (const [queryKey, data] of matches) {
        if (!data) continue;
        const { pages, pageParams } = data;
        if (!pages || pages.length === 0) continue;

        const updatedPages = pages.map((page) => ({
          ...page,
          items: page.items.map((item) =>
            ids.includes(item.id) ? { ...item, entryDate } : item
          ),
        }));

        // C3: Capture previous items for rollback
        for (const id of ids) {
          const prevItem = data.pages
            .flatMap((p) => p.items)
            .find((item) => item.id === id);
          if (prevItem != null) {
            op.patches.push({
              type: "upsert",
              entityId: id,
              entity: { ...prevItem, entryDate } as SourceDocumentListItemDto,
              prevEntity: prevItem,
            });
          }
        }

        // Apply optimistic update to stream cache
        queryClient.setQueryData<InfiniteData<StreamPage>>(queryKey, {
          pages: updatedPages,
          pageParams,
        });
      }

      // Also update detail caches
      for (const id of ids) {
        const lightKey = queryKeys.sourceDocumentLight(id);
        const existingLight = queryClient.getQueryData(lightKey);
        if (existingLight) {
          queryClient.setQueryData(lightKey, {
            ...(existingLight as Record<string, unknown>),
            entryDate,
          });
        }
      }

      return { operationId: op.operationId, ids };
    },
    onSuccess: (_data, { ids, entryDate }, context) => {
      if (context == null) return;
      // Commit the operation — optimistic data is trusted
      manager.commitOperation(context.operationId, null, queryClient);
      toast.success(tBatch("datesUpdated", { count: ids.length }));
      clearSelection();
    },
    onError: (_error, _variables, context) => {
      if (context == null) return;
      manager.rollbackOperation(context.operationId, queryClient);
      toast.error(tCommon("error"));
    },
    onSettled: () => {
      // Targeted invalidation for derived data
      queryClient.invalidateQueries({
        predicate: invalidateLedgerStats(ledgerId),
      });
      queryClient.invalidateQueries({
        predicate: invalidateCalendar(ledgerId),
      });
    },
  });

  return {
    deleteSourceDocument,
    batchUpdateDates,
  };
}
