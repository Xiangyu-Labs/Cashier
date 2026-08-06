import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import type { SourceDocumentListItemDto, StreamPage } from "@/modules/source-document/contracts";
import {
  applyOptimisticUpsert,
  applyServerRefreshUpsert,
  applyOptimisticDelete,
  applySourceDocumentReconciliation,
  seedSourceDocumentEntities,
  type SourceDocumentEntityStore,
} from "@/modules/source-document/hooks/source-document-optimistic-cache";
import { patchExistingSourceDocumentDetail } from "@/modules/source-document/hooks/source-document-detail-cache";
import { STREAM_PAGE_LIMIT } from "@/modules/source-document/stream-cache-merge";

function makeItem(entryDate: string): SourceDocumentListItemDto {
  return {
    id: "doc-1",
    ledgerId: "ledger-1",
    title: "Receipt",
    text: null,
    files: [],
    status: "completed",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate,
    metadata: {},
    createdAt: "2026-07-27T10:00:00.000Z",
    updatedAt: "2026-07-27T10:00:00.000Z",
    deletedAt: null,
    hasImages: false,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: null,
    ledgerEntries: [],
  };
}

function page(items: SourceDocumentListItemDto[]): InfiniteData<StreamPage> {
  return {
    pages: [{ items, nextCursor: null, generation: 1 }],
    pageParams: [undefined],
  };
}

function makeEntry(id: string, itemName: string) {
  return {
    id,
    ledgerId: "ledger-1",
    categoryId: null,
    sourceDocumentId: "doc-1",
    amount: "1.00",
    currency: "USD",
    itemName,
    description: null,
    convertedAmount: null,
    exchangeRate: null,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    deletedAt: null,
    category: null,
  };
}

describe("source document optimistic cache", () => {
  it("does not use original amounts for main-currency range filters", () => {
    const client = new QueryClient();
    const key = queryKeys.sourceDocumentStream("ledger-1", {
      minAmount: 1,
      maxAmount: 2,
    });
    client.setQueryData(key, page([]));

    applyOptimisticUpsert(client, "ledger-1", {
      ...makeItem("2026-07-27"),
      ledgerEntries: [makeEntry("entry-1", "Unconverted")],
    });

    expect(client.getQueryData<InfiniteData<StreamPage>>(key)?.pages[0]?.items).toEqual([]);
  });

  it("patches an existing stale detail from the clicked stream item", () => {
    const client = new QueryClient();
    const staleDetail = {
      ...makeItem("2026-07-27"),
      title: "Old title",
      text: "full detail text",
      files: [{ id: "old", contentType: "image/png", byteSize: 1, originalFilename: null }],
    };
    const currentItem = {
      ...makeItem("2026-07-28"),
      title: "Current title",
      files: [{ id: "new", contentType: "image/png", byteSize: 2, originalFilename: null }],
    };
    client.setQueryData(queryKeys.sourceDocument("doc-1"), staleDetail);

    patchExistingSourceDocumentDetail(client, currentItem);

    const patched = client.getQueryData<typeof staleDetail>(queryKeys.sourceDocument("doc-1"));
    expect(patched).toMatchObject({
      entryDate: "2026-07-28",
      title: "Current title",
      files: currentItem.files,
      text: "full detail text",
    });
    expect(client.getQueryData(queryKeys.sourceDocumentLight("doc-1"))).toBeUndefined();
  });

  it("moves a date edit across every matching stream cache and patches details", () => {
    const client = new QueryClient();
    const july27Key = queryKeys.sourceDocumentStream("ledger-1", {
      startDate: "2026-07-27",
      endDate: "2026-07-27",
    });
    const july26Key = queryKeys.sourceDocumentStream("ledger-1", {
      startDate: "2026-07-26",
      endDate: "2026-07-26",
    });
    client.setQueryData(july27Key, page([makeItem("2026-07-27")]));
    client.setQueryData(july26Key, page([]));
    client.setQueryData(queryKeys.sourceDocument("doc-1"), makeItem("2026-07-27"));

    applyOptimisticUpsert(client, "ledger-1", makeItem("2026-07-26"));

    expect(client.getQueryData<InfiniteData<StreamPage>>(july27Key)?.pages[0]?.items).toEqual([]);
    expect(
      client.getQueryData<InfiniteData<StreamPage>>(july26Key)?.pages[0]?.items[0]?.entryDate
    ).toBe("2026-07-26");
    expect(
      client.getQueryData<SourceDocumentListItemDto>(queryKeys.sourceDocument("doc-1"))?.entryDate
    ).toBe("2026-07-26");
  });

  it("removes a document when its fallback submission date misses the cached filter", () => {
    const client = new QueryClient();
    const july28Key = queryKeys.sourceDocumentStream("ledger-1", {
      startDate: "2026-07-28",
      endDate: "2026-07-28",
    });
    client.setQueryData(july28Key, page([makeItem("2026-07-28")]));

    applyOptimisticUpsert(client, "ledger-1", {
      ...makeItem("2026-07-28"),
      entryDate: null,
      createdAt: "2026-07-27T10:00:00.000Z",
    });

    expect(client.getQueryData<InfiniteData<StreamPage>>(july28Key)?.pages[0]?.items).toEqual([]);
  });

  it("does not match a title when no entry text matches the search", () => {
    const client = new QueryClient();
    const key = queryKeys.sourceDocumentStream("ledger-1", { search: "coffee" });
    client.setQueryData(key, page([]));

    applyOptimisticUpsert(client, "ledger-1", {
      ...makeItem("2026-07-28"),
      title: "Coffee Shop",
      ledgerEntries: [makeEntry("entry-1", "Latte")],
    });

    expect(client.getQueryData<InfiniteData<StreamPage>>(key)?.pages[0]?.items).toEqual([]);
  });

  it("requires one entry to satisfy both amount bounds", () => {
    const client = new QueryClient();
    const key = queryKeys.sourceDocumentStream("ledger-1", {
      minAmount: 10,
      maxAmount: 90,
    });
    client.setQueryData(key, page([]));

    applyOptimisticUpsert(client, "ledger-1", {
      ...makeItem("2026-07-28"),
      ledgerEntries: [
        { ...makeEntry("entry-low", "Low"), amount: "5.00" },
        { ...makeEntry("entry-high", "High"), amount: "100.00" },
      ],
    });

    expect(client.getQueryData<InfiniteData<StreamPage>>(key)?.pages[0]?.items).toEqual([]);
  });

  it("excludes documents without entries from amount and search windows", () => {
    const client = new QueryClient();
    const amountKey = queryKeys.sourceDocumentStream("ledger-1", { minAmount: 1 });
    const searchKey = queryKeys.sourceDocumentStream("ledger-1", { search: "latte" });
    client.setQueryData(amountKey, page([]));
    client.setQueryData(searchKey, page([]));

    applyOptimisticUpsert(client, "ledger-1", makeItem("2026-07-28"));

    expect(client.getQueryData<InfiniteData<StreamPage>>(amountKey)?.pages[0]?.items).toEqual([]);
    expect(client.getQueryData<InfiniteData<StreamPage>>(searchKey)?.pages[0]?.items).toEqual([]);
  });

  it("keeps canonical entries complete while projecting only matching page entries", () => {
    const client = new QueryClient();
    const key = queryKeys.sourceDocumentStream("ledger-1", { search: "latte" });
    client.setQueryData(key, page([]));
    const item = {
      ...makeItem("2026-07-28"),
      ledgerEntries: [makeEntry("entry-latte", "Latte"), makeEntry("entry-cake", "Cake")],
    };

    applyOptimisticUpsert(client, "ledger-1", item);

    expect(
      client.getQueryData<SourceDocumentEntityStore>(
        queryKeys.sourceDocumentEntities("ledger-1")
      )?.["doc-1"]?.ledgerEntries
    ).toHaveLength(2);
    expect(
      client.getQueryData<InfiniteData<StreamPage>>(key)?.pages[0]?.items[0]?.ledgerEntries
    ).toEqual([item.ledgerEntries[0]]);
  });

  it("never writes filtered page projections into the canonical entity store", () => {
    const client = new QueryClient();
    const key = queryKeys.sourceDocumentStream("ledger-1", { search: "latte" });
    const filteredItem = {
      ...makeItem("2026-07-28"),
      ledgerEntries: [makeEntry("entry-latte", "Latte")],
    };
    client.setQueryData(key, page([filteredItem]));

    seedSourceDocumentEntities(client, "ledger-1", [filteredItem], key);

    const canonical = client.getQueryData<SourceDocumentEntityStore>(
      queryKeys.sourceDocumentEntities("ledger-1")
    )?.["doc-1"];
    expect(canonical?.ledgerEntries).toEqual([]);
    expect(
      client.getQueryData<InfiniteData<StreamPage>>(key)?.pages[0]?.items[0]?.ledgerEntries
    ).toHaveLength(1);
  });

  it("keeps full canonical entries when a filtered page arrives later", () => {
    const client = new QueryClient();
    const full = {
      ...makeItem("2026-07-28"),
      ledgerEntries: [makeEntry("entry-latte", "Latte"), makeEntry("entry-cake", "Cake")],
    };
    seedSourceDocumentEntities(client, "ledger-1", [full]);

    const key = queryKeys.sourceDocumentStream("ledger-1", { search: "latte" });
    const filteredItem = {
      ...full,
      updatedAt: "2026-07-28T11:00:00.000Z",
      ledgerEntries: [makeEntry("entry-latte", "Latte")],
    };
    client.setQueryData(key, page([filteredItem]));
    seedSourceDocumentEntities(client, "ledger-1", [filteredItem], key);

    const canonical = client.getQueryData<SourceDocumentEntityStore>(
      queryKeys.sourceDocumentEntities("ledger-1")
    )?.["doc-1"];
    expect(canonical?.ledgerEntries?.map((entry) => entry.id).sort()).toEqual([
      "entry-cake",
      "entry-latte",
    ]);
  });

  it("clears files and hasImages on an authoritative refresh", () => {
    const client = new QueryClient();
    const existing = {
      ...makeItem("2026-07-28"),
      updatedAt: "2026-07-28T10:00:00.000Z",
      files: [{ id: "file-1", contentType: "image/png", byteSize: 10, originalFilename: null }],
      hasImages: true,
    };
    seedSourceDocumentEntities(client, "ledger-1", [existing]);
    client.setQueryData(queryKeys.sourceDocument("doc-1"), {
      ...existing,
      text: "full detail text",
    });

    const refreshed = {
      ...makeItem("2026-07-28"),
      updatedAt: "2026-07-28T11:00:00.000Z",
      files: [],
      hasImages: false,
      ledgerEntries: [],
    };
    applyServerRefreshUpsert(client, "ledger-1", refreshed);

    const canonical = client.getQueryData<SourceDocumentEntityStore>(
      queryKeys.sourceDocumentEntities("ledger-1")
    )?.["doc-1"];
    expect(canonical?.files).toEqual([]);
    expect(canonical?.hasImages).toBe(false);
    const detail = client.getQueryData(queryKeys.sourceDocument("doc-1")) as Record<
      string,
      unknown
    >;
    expect(detail.files).toEqual([]);
    expect(detail.hasImages).toBe(false);
  });

  it("replaces stale entities with the authoritative page result", () => {
    const queryClient = new QueryClient();
    const stale: SourceDocumentListItemDto = {
      ...makeItem("2026-07-01"),
      title: "Old title",
      status: "processing",
      ledgerEntries: [makeEntry("entry-old", "Old entry")],
    };
    const authoritative: SourceDocumentListItemDto = {
      ...makeItem("2026-07-01"),
      title: "Authoritative title",
      status: "completed",
      ledgerEntries: [makeEntry("entry-new", "New entry")],
    };
    const unrelated = { ...makeItem("2026-07-02"), id: "doc-2" };
    const key = queryKeys.sourceDocumentEntities("ledger-1");

    queryClient.setQueryData(key, {
      ["doc-1"]: stale,
      [unrelated.id]: unrelated,
    });
    seedSourceDocumentEntities(queryClient, "ledger-1", [{ ...authoritative, id: "doc-1" }]);

    expect(queryClient.getQueryData(key)).toEqual({
      ["doc-1"]: { ...authoritative, id: "doc-1" },
      [unrelated.id]: unrelated,
    });
  });

  it("inserts a server delta at its server-order position and re-slices pages", () => {
    const client = new QueryClient();
    const key = queryKeys.sourceDocumentStream("ledger-1");
    const items = orderedItems(40);
    client.setQueryData(
      key,
      multiPage([items.slice(0, STREAM_PAGE_LIMIT), items.slice(STREAM_PAGE_LIMIT)])
    );

    const inserted = {
      ...makeItem("2026-06-15"),
      id: "doc-new",
      createdAt: "2026-06-15T10:00:00.000Z",
      updatedAt: "2026-06-15T10:00:00.000Z",
    };
    const resetSpy = vi.spyOn(client, "resetQueries");

    applyServerRefreshUpsert(client, "ledger-1", inserted);

    const data = client.getQueryData<InfiniteData<StreamPage>>(key);
    const flat = data?.pages.flatMap((page) => page.items) ?? [];
    expect(flat).toHaveLength(41);
    // 06-30..06-16 occupy indices 0-14; the new 06-15 doc lands at index 15.
    expect(flat[15]?.id).toBe("doc-new");
    expect(data?.pages[0]?.items).toHaveLength(STREAM_PAGE_LIMIT);
    expect(data?.pages[1]?.items).toHaveLength(STREAM_PAGE_LIMIT);
    expect(data?.pages[2]?.items).toHaveLength(1);
    // Non-final page cursors are derived from their last item.
    expect(data?.pages[0]?.nextCursor).toContain("v2|ledger-1|");
    expect(resetSpy).not.toHaveBeenCalled();
  });

  it("removes a tombstone from every loaded page and re-slices", () => {
    const client = new QueryClient();
    const key = queryKeys.sourceDocumentStream("ledger-1");
    const items = orderedItems(40);
    client.setQueryData(
      key,
      multiPage([items.slice(0, STREAM_PAGE_LIMIT), items.slice(STREAM_PAGE_LIMIT)])
    );
    const removedId = items[25]?.id ?? "doc-26";

    applyOptimisticDelete(client, "ledger-1", removedId);

    const data = client.getQueryData<InfiniteData<StreamPage>>(key);
    const flat = data?.pages.flatMap((page) => page.items) ?? [];
    expect(flat).toHaveLength(39);
    expect(flat.some((item) => item.id === removedId)).toBe(false);
    expect(data?.pages[0]?.items).toHaveLength(STREAM_PAGE_LIMIT);
    expect(data?.pages[1]?.items).toHaveLength(19);
    expect(
      client.getQueryData<Record<string, unknown>>(queryKeys.sourceDocumentEntities("ledger-1"))
    ).not.toHaveProperty(removedId);
  });

  it("re-slices pages when an inserted item crosses the page boundary", () => {
    const client = new QueryClient();
    const key = queryKeys.sourceDocumentStream("ledger-1");
    const items = orderedItems(39);
    client.setQueryData(
      key,
      multiPage([items.slice(0, STREAM_PAGE_LIMIT), items.slice(STREAM_PAGE_LIMIT)])
    );
    const inserted = {
      ...makeItem("2026-05-01"),
      id: "doc-new",
      createdAt: "2026-05-01T10:00:00.000Z",
      updatedAt: "2026-05-01T10:00:00.000Z",
    };

    applyServerRefreshUpsert(client, "ledger-1", inserted);

    const data = client.getQueryData<InfiniteData<StreamPage>>(key);
    // The original 39 items span 06-30..05-22; the new 05-01 doc sorts last,
    // so the local re-slice packs all 40 items into exactly two pages.
    expect(data?.pages).toHaveLength(2);
    expect(data?.pages[0]?.items).toHaveLength(STREAM_PAGE_LIMIT);
    expect(data?.pages[1]?.items).toHaveLength(STREAM_PAGE_LIMIT);
    expect(data?.pages[1]?.items.at(-1)?.id).toBe("doc-new");
  });

  it("keeps a newer entity when a stale delta or page response arrives", () => {
    const client = new QueryClient();
    const key = queryKeys.sourceDocumentStream("ledger-1");
    const fresh = {
      ...makeItem("2026-06-10"),
      id: "doc-fresh",
      title: "Fresh title",
      createdAt: "2026-06-10T10:00:00.000Z",
      updatedAt: "2026-06-10T11:00:00.000Z",
    };
    const stale = {
      ...fresh,
      title: "Stale title",
      updatedAt: "2026-06-10T10:00:00.000Z",
    };
    client.setQueryData(key, multiPage([[fresh]]));
    seedSourceDocumentEntities(client, "ledger-1", [fresh]);

    applyServerRefreshUpsert(client, "ledger-1", stale);
    expect(client.getQueryData<InfiniteData<StreamPage>>(key)?.pages[0]?.items[0]?.title).toBe(
      "Fresh title"
    );

    seedSourceDocumentEntities(client, "ledger-1", [stale]);
    expect(
      client.getQueryData<Record<string, SourceDocumentListItemDto>>(
        queryKeys.sourceDocumentEntities("ledger-1")
      )?.["doc-fresh"]?.title
    ).toBe("Fresh title");
  });

  it("reconciles tombstones while preserving sparse files and entries", () => {
    const client = new QueryClient();
    const key = queryKeys.sourceDocumentStream("ledger-1");
    const existing: SourceDocumentListItemDto = {
      ...makeItem("2026-06-10"),
      id: "doc-1",
      title: "Receipt",
      status: "candidate_pending",
      files: [{ id: "file-1", contentType: "image/png", byteSize: 10, originalFilename: null }],
      ledgerEntries: [makeEntry("entry-1", "Lunch")],
      hasImages: true,
      createdAt: "2026-06-10T10:00:00.000Z",
      updatedAt: "2026-06-10T10:00:00.000Z",
    };
    client.setQueryData(key, multiPage([[existing]]));
    seedSourceDocumentEntities(client, "ledger-1", [existing]);

    const minimal: SourceDocumentListItemDto = {
      ...makeItem("2026-06-10"),
      id: "doc-1",
      title: null,
      status: "completed",
      entryDate: null,
      files: [],
      ledgerEntries: [],
      hasImages: false,
      createdAt: "2026-06-10T10:00:00.000Z",
      updatedAt: "2026-06-10T11:00:00.000Z",
    };
    applySourceDocumentReconciliation(client, "ledger-1", "doc-1", {
      operationId: "op-1",
      entity: minimal,
      entityVersion: minimal.updatedAt,
      countPatch: null,
      streamMembershipChanged: true,
      orderingChanged: false,
    });

    const merged = client.getQueryData<InfiniteData<StreamPage>>(key)?.pages[0]?.items[0];
    expect(merged?.status).toBe("completed");
    expect(merged?.entryDate).toBeNull();
    expect(merged?.title).toBeNull();
    expect(merged?.files).toHaveLength(1);
    expect(merged?.ledgerEntries).toHaveLength(1);

    applySourceDocumentReconciliation(client, "ledger-1", "doc-1", {
      operationId: "op-2",
      entity: null,
      entityVersion: "2026-06-10T12:00:00.000Z",
      countPatch: null,
      streamMembershipChanged: true,
      orderingChanged: false,
    });
    expect(client.getQueryData<InfiniteData<StreamPage>>(key)?.pages[0]?.items).toHaveLength(0);
  });
});

function makeItemAt(date: string, id: string, createdAt: string): SourceDocumentListItemDto {
  return {
    ...makeItem(date),
    id,
    createdAt,
    updatedAt: createdAt,
  };
}

function orderedItems(count: number): SourceDocumentListItemDto[] {
  return Array.from({ length: count }, (_, index) => {
    const day = 30 - (index % 30);
    const month = index < 30 ? 6 : 5;
    const date = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return makeItemAt(date, `doc-${String(index + 1).padStart(2, "0")}`, `${date}T10:00:00.000Z`);
  });
}

function multiPage(groups: SourceDocumentListItemDto[][]): InfiniteData<StreamPage> {
  return {
    pages: groups.map((items) => ({ items, nextCursor: null, generation: 1 })),
    pageParams: [undefined, ...groups.slice(1).map(() => undefined)],
  };
}
