import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";

type SourceDocumentListItem = { id?: string; text?: string };
type PaginatedItems = { items: SourceDocumentListItem[]; total: number };

describe("useLedgerEntriesMutations - onOptimisticUpdate bug", () => {
  it("should FAIL when cache data is an array (no items property) - reproducing the bug", () => {
    // This test reproduces the actual bug:
    // When cache contains an array instead of PaginatedSourceDocumentsResponse,
    // old.items is undefined and old.items.filter throws

    const queryClient = new QueryClient();

    // Set cache with array data (simulates the actual cache structure)
    queryClient.setQueryData(
      ["sourceDocuments", "test-ledger-id", "all"],
      [
        { id: "doc-1", text: "Test Doc 1" },
        { id: "doc-2", text: "Test Doc 2" },
      ]
    );

    // This simulates the buggy onOptimisticUpdate code (before fix)
    // which does: if (!old) return old;  // old is truthy (array), so continues
    //            old.items.filter(...)   // old.items is undefined -> THROWS
    const buggyOnOptimisticUpdate = (old: unknown) => {
      if (old === undefined) return old;
      const items = (old as PaginatedItems).items;
      // This is the buggy code that exists in the codebase
      return {
        ...(old as object),
        items: items.filter((d) => d.id !== "doc-1"),
        total: (old as { total: number }).total - 1,
      };
    };

    // This should throw: "Cannot read properties of undefined (reading 'filter')"
    const queryData = queryClient.getQueryData(["sourceDocuments", "test-ledger-id", "all"]);

    expect(() => buggyOnOptimisticUpdate(queryData)).toThrow(
      "Cannot read properties of undefined (reading 'filter')"
    );
  });

  it("should PASS when cache data is proper PaginatedSourceDocumentsResponse", () => {
    const queryClient = new QueryClient();

    // Set cache with proper paginated response structure
    queryClient.setQueryData(["sourceDocuments", "test-ledger-id", "all"], {
      items: [
        { id: "doc-1", text: "Test Doc 1" },
        { id: "doc-2", text: "Test Doc 2" },
      ],
      hasMore: false,
      total: 2,
    });

    const buggyOnOptimisticUpdate = (old: unknown) => {
      if (old === undefined) return old;
      const items = (old as PaginatedItems).items;
      return {
        ...(old as object),
        items: items.filter((d) => d.id !== "doc-1"),
        total: (old as { total: number }).total - 1,
      };
    };

    const queryData = queryClient.getQueryData(["sourceDocuments", "test-ledger-id", "all"]);

    // This should NOT throw because items exists
    expect(() => buggyOnOptimisticUpdate(queryData)).not.toThrow();
  });
});
