import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";

describe("useTaskQueueMutations - onOptimisticUpdate bug", () => {
  it("should handle removeItemsById when cache data has no items property", () => {
    const queryClient = new QueryClient();

    // Set cache with wrong structure
    queryClient.setQueryData(["taskQueue", "test-ledger-id"], {
      // Missing items property
      stats: { total: 5 },
    });

    const buggyRemoveItemsById = (old: unknown, ids: string[]) => {
      if (old === undefined) return old;
      const idsSet = new Set(ids);
      const removedItems = (old as { items: unknown[] }).items.filter((item: { id?: string }) =>
        idsSet.has(item.id ?? "")
      );
      return {
        ...(old as object),
        items: (old as { items: unknown[] }).items.filter((item: { id?: string }) => !idsSet.has(item.id ?? "")),
        stats: {
          ...(old as { stats: object }).stats,
          total: (old as { stats: { total: number } }).stats.total - removedItems.length,
        },
      };
    };

    const queryData = queryClient.getQueryData(["taskQueue", "test-ledger-id"]);

    expect(() => buggyRemoveItemsById(queryData, ["task-1"])).toThrow(
      "Cannot read properties of undefined (reading 'filter')"
    );
  });

  it("should handle removeItemsBySourceDocId when cache data has no items property", () => {
    const queryClient = new QueryClient();

    // Set cache with wrong structure
    queryClient.setQueryData(["taskQueue", "test-ledger-id"], {
      // Missing items property
      stats: { total: 5 },
    });

    const buggyRemoveItemsBySourceDocId = (old: unknown, sourceDocIds: string[]) => {
      if (old === undefined) return old;
      const idsSet = new Set(sourceDocIds);
      const newItems = (old as { items: unknown[] }).items.filter(
        (item: { sourceDocumentId?: string }) =>
          item.sourceDocumentId === undefined || !idsSet.has(item.sourceDocumentId)
      );
      const removedCount = (old as { items: unknown[] }).items.length - newItems.length;
      return {
        ...(old as object),
        items: newItems,
        stats: {
          ...(old as { stats: object }).stats,
          total: (old as { stats: { total: number } }).stats.total - removedCount,
        },
      };
    };

    const queryData = queryClient.getQueryData(["taskQueue", "test-ledger-id"]);

    expect(() => buggyRemoveItemsBySourceDocId(queryData, ["doc-1"])).toThrow(
      "Cannot read properties of undefined (reading 'filter')"
    );
  });

  it("should handle batchRetry when cache data has no items property", () => {
    const queryClient = new QueryClient();

    // Set cache with wrong structure
    queryClient.setQueryData(["taskQueue", "test-ledger-id"], {
      // Missing items property
      stats: { total: 5 },
    });

    const buggyBatchRetry = (old: unknown, ids: string[]) => {
      if (old === undefined) return old;
      return {
        ...(old as object),
        items: (old as { items: unknown[] }).items.map((item: { id?: string; sourceDocumentId?: string }) =>
          ids.includes(item.id ?? "") && item.sourceDocumentId !== undefined && item.sourceDocumentId !== ""
            ? { ...item, status: "pending" }
            : item
        ),
      };
    };

    const queryData = queryClient.getQueryData(["taskQueue", "test-ledger-id"]);

    expect(() => buggyBatchRetry(queryData, ["task-1"])).toThrow(
      "Cannot read properties of undefined (reading 'map')"
    );
  });

  it("should PASS with proper TaskQueueResult structure", () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(["taskQueue", "test-ledger-id"], {
      items: [
        { id: "task-1", sourceDocumentId: "doc-1", status: "failed" },
        { id: "task-2", sourceDocumentId: "doc-2", status: "completed" },
      ],
      stats: { total: 2 },
    });

    const buggyRemoveItemsById = (old: unknown, ids: string[]) => {
      if (old === undefined) return old;
      const idsSet = new Set(ids);
      const removedItems = (old as { items: unknown[] }).items.filter((item: { id?: string }) =>
        idsSet.has(item.id ?? "")
      );
      return {
        ...(old as object),
        items: (old as { items: unknown[] }).items.filter((item: { id?: string }) => !idsSet.has(item.id ?? "")),
        stats: {
          ...(old as { stats: object }).stats,
          total: (old as { stats: { total: number } }).stats.total - removedItems.length,
        },
      };
    };

    const queryData = queryClient.getQueryData(["taskQueue", "test-ledger-id"]);

    expect(() => buggyRemoveItemsById(queryData, ["task-1"])).not.toThrow();
  });
});
