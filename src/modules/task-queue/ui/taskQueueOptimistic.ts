import type { TaskQueueResult } from "@/modules/task-queue/contracts";

export function removeItemsById(
  old: TaskQueueResult | undefined,
  ids: string[]
): TaskQueueResult | undefined {
  if (old === undefined || old.items === undefined) return old;

  const idsSet = new Set(ids);
  const removedItems = old.items.filter((item) => idsSet.has(item.id));

  return {
    ...old,
    items: old.items.filter((item) => !idsSet.has(item.id)),
    stats: {
      ...old.stats,
      total: old.stats.total - removedItems.length,
    },
  };
}

export function removeItemsBySourceDocId(
  old: TaskQueueResult | undefined,
  sourceDocIds: string[]
): TaskQueueResult | undefined {
  if (old === undefined || old.items === undefined) return old;

  const idsSet = new Set(sourceDocIds);
  const newItems = old.items.filter(
    (item) => item.sourceDocumentId === undefined || !idsSet.has(item.sourceDocumentId)
  );
  const removedCount = old.items.length - newItems.length;

  return {
    ...old,
    items: newItems,
    stats: {
      ...old.stats,
      total: old.stats.total - removedCount,
    },
  };
}

export function markItemsPendingBySourceDocId(
  old: TaskQueueResult | undefined,
  sourceDocIds: string[]
): TaskQueueResult | undefined {
  if (old === undefined || old.items === undefined) return old;

  return {
    ...old,
    items: old.items.map((item) =>
      item.sourceDocumentId !== undefined &&
      item.sourceDocumentId !== "" &&
      sourceDocIds.includes(item.sourceDocumentId)
        ? { ...item, status: "pending" as const }
        : item
    ),
  };
}
