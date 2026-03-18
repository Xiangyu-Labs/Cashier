import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";

describe("useBatchSourceDocumentActions - onOptimisticUpdate bug", () => {
  it("should handle batchDelete when cache data has no items property", () => {
    const queryClient = new QueryClient();

    // Set cache with array data (wrong structure)
    queryClient.setQueryData(
      ["sourceDocuments", "test-ledger-id", "all"],
      [
        { id: "doc-1", text: "Test Doc 1" },
        { id: "doc-2", text: "Test Doc 2" },
      ]
    );

    const buggyOnOptimisticUpdate = (old: unknown) => {
      if (old === undefined) return old;
      return {
        ...(old as object),
        items: (old as { items: unknown[] }).items.filter((d: { id?: string }) => !["doc-1"].includes(d.id ?? "")),
        total: (old as { total: number }).total - 1,
      };
    };

    const queryData = queryClient.getQueryData([
      "sourceDocuments",
      "test-ledger-id",
      "all",
    ]);

    expect(() => buggyOnOptimisticUpdate(queryData)).toThrow(
      "Cannot read properties of undefined (reading 'filter')"
    );
  });

  it("should handle batchUpdateDates when cache data has no items property", () => {
    const queryClient = new QueryClient();

    // Set cache with array data (wrong structure)
    queryClient.setQueryData(
      ["sourceDocuments", "test-ledger-id", "all"],
      [
        { id: "doc-1", text: "Test Doc 1", entryDate: "2024-01-01" },
        { id: "doc-2", text: "Test Doc 2", entryDate: "2024-01-02" },
      ]
    );

    const buggyOnOptimisticUpdate = (old: unknown) => {
      if (old === undefined) return old;
      return {
        ...(old as object),
        items: (old as { items: unknown[] }).items.map((d: { id?: string }) =>
          d.id === "doc-1" ? { ...d, entryDate: "2024-03-17" } : d
        ),
      };
    };

    const queryData = queryClient.getQueryData([
      "sourceDocuments",
      "test-ledger-id",
      "all",
    ]);

    expect(() => buggyOnOptimisticUpdate(queryData)).toThrow(
      "Cannot read properties of undefined (reading 'map')"
    );
  });

  it("should handle batchRetry when cache data has no items property", () => {
    const queryClient = new QueryClient();

    // Set cache with array data (wrong structure)
    queryClient.setQueryData(
      ["sourceDocuments", "test-ledger-id", "all"],
      [
        { id: "doc-1", text: "Test Doc 1", status: "failed" },
        { id: "doc-2", text: "Test Doc 2", status: "completed" },
      ]
    );

    const buggyOnOptimisticUpdate = (old: unknown) => {
      if (old === undefined) return old;
      return {
        ...(old as object),
        items: (old as { items: unknown[] }).items.map((d: { id?: string }) =>
          d.id === "doc-1" ? { ...d, status: "queued" } : d
        ),
      };
    };

    const queryData = queryClient.getQueryData([
      "sourceDocuments",
      "test-ledger-id",
      "all",
    ]);

    expect(() => buggyOnOptimisticUpdate(queryData)).toThrow(
      "Cannot read properties of undefined (reading 'map')"
    );
  });

  it("should PASS with proper paginated response structure", () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(
      ["sourceDocuments", "test-ledger-id", "all"],
      {
        items: [
          { id: "doc-1", text: "Test Doc 1" },
          { id: "doc-2", text: "Test Doc 2" },
        ],
        hasMore: false,
        total: 2,
      }
    );

    const buggyOnOptimisticUpdate = (old: unknown) => {
      if (old === undefined) return old;
      return {
        ...(old as object),
        items: (old as { items: unknown[] }).items.filter((d: { id?: string }) => d.id !== "doc-1"),
        total: (old as { total: number }).total - 1,
      };
    };

    const queryData = queryClient.getQueryData([
      "sourceDocuments",
      "test-ledger-id",
      "all",
    ]);

    expect(() => buggyOnOptimisticUpdate(queryData)).not.toThrow();
  });
});
