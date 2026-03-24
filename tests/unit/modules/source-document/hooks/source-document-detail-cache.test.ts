import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import type {
  SourceDocumentCollectionDto,
  SourceDocumentDto,
  SourceDocumentLedgerEntryDto,
  SourceDocumentLightWithEntriesDto,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";
import {
  removeBatchEntriesFromCaches,
  removeSingleEntryFromCaches,
  updateBatchEntriesInCaches,
  updateSingleEntryInCaches,
} from "@/modules/source-document/hooks/source-document-detail-cache";

function buildEntry(overrides: Partial<SourceDocumentLedgerEntryDto> = {}) {
  return {
    id: "entry-1",
    ledgerId: "ledger-1",
    categoryId: null,
    sourceDocumentId: "doc-1",
    amount: "10.00",
    currency: "USD",
    itemName: "Coffee",
    description: null,
    convertedAmount: "72.00",
    exchangeRate: "7.2",
    createdAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T11:00:00.000Z",
    deletedAt: null,
    category: null,
    ...overrides,
  };
}

function buildDetailDoc(): SourceDocumentDto {
  return {
    id: "doc-1",
    ledgerId: "ledger-1",
    title: "Receipt",
    text: "Receipt text",
    imageUrls: ["/api/uploads/ledger-1/doc-1/a.jpg"],
    status: "completed",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: "2026-03-20",
    metadata: {},
    createdAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T11:00:00.000Z",
    deletedAt: null,
    hasImages: true,
    ledgerEntries: [buildEntry(), buildEntry({ id: "entry-2", itemName: "Tea" })],
  };
}

function buildLightDoc(): SourceDocumentLightWithEntriesDto {
  return {
    id: "doc-1",
    ledgerId: "ledger-1",
    title: "Receipt",
    text: "Receipt text",
    imageUrls: ["/api/uploads/ledger-1/doc-1/a.jpg"],
    status: "completed",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: "2026-03-20",
    metadata: {},
    createdAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T11:00:00.000Z",
    deletedAt: null,
    hasImages: true,
    ledgerEntries: [buildEntry(), buildEntry({ id: "entry-2", itemName: "Tea" })],
  };
}

function buildCollectionDoc(): SourceDocumentListItemDto {
  return {
    id: "doc-1",
    ledgerId: "ledger-1",
    title: "Receipt",
    text: null,
    imageUrls: [],
    status: "completed",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: "2026-03-20",
    metadata: {},
    createdAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T11:00:00.000Z",
    deletedAt: null,
    hasImages: true,
    ledgerEntries: [buildEntry(), buildEntry({ id: "entry-2", itemName: "Tea" })],
  };
}

function seedCaches(queryClient: QueryClient) {
  queryClient.setQueryData(queryKeys.sourceDocument("doc-1"), buildDetailDoc());
  queryClient.setQueryData(queryKeys.sourceDocumentLight("doc-1"), buildLightDoc());
  queryClient.setQueryData<SourceDocumentCollectionDto>(
    queryKeys.sourceDocumentCollection("ledger-1", { limit: 1000 }),
    {
      items: [buildCollectionDoc()],
      hasMore: false,
      total: 1,
    }
  );
}

describe("source-document-detail-cache", () => {
  it("updates sourceDocumentLight caches alongside detail and collection caches", () => {
    const queryClient = new QueryClient();
    seedCaches(queryClient);

    updateSingleEntryInCaches(queryClient, "doc-1", "ledger-1", "entry-1", {
      itemName: "Updated",
    });

    expect(
      queryClient.getQueryData<SourceDocumentLightWithEntriesDto>(queryKeys.sourceDocumentLight("doc-1"))
        ?.ledgerEntries?.[0]?.itemName
    ).toBe("Updated");
  });

  it("applies batch entry updates to light caches", () => {
    const queryClient = new QueryClient();
    seedCaches(queryClient);

    updateBatchEntriesInCaches(queryClient, "doc-1", "ledger-1", ["entry-1", "entry-2"], {
      itemName: "Updated batch",
      amount: 20,
    });

    expect(
      queryClient.getQueryData<SourceDocumentLightWithEntriesDto>(queryKeys.sourceDocumentLight("doc-1"))
        ?.ledgerEntries
    ).toEqual([
      expect.objectContaining({ itemName: "Updated batch", amount: "20.00" }),
      expect.objectContaining({ itemName: "Updated batch", amount: "20.00" }),
    ]);
  });

  it("removes a single entry from light caches", () => {
    const queryClient = new QueryClient();
    seedCaches(queryClient);

    removeSingleEntryFromCaches(queryClient, "doc-1", "ledger-1", "entry-1");

    expect(
      queryClient.getQueryData<SourceDocumentLightWithEntriesDto>(queryKeys.sourceDocumentLight("doc-1"))
        ?.ledgerEntries
    ).toEqual([expect.objectContaining({ id: "entry-2" })]);
  });

  it("removes batch entries from light caches", () => {
    const queryClient = new QueryClient();
    seedCaches(queryClient);

    removeBatchEntriesFromCaches(queryClient, "doc-1", "ledger-1", ["entry-1", "entry-2"]);

    expect(
      queryClient.getQueryData<SourceDocumentLightWithEntriesDto>(queryKeys.sourceDocumentLight("doc-1"))
        ?.ledgerEntries
    ).toEqual([]);
  });
});
