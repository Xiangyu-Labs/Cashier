import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import type { SourceDocumentListItemDto, StreamPage } from "@/modules/source-document/contracts";
import { applyStreamRefreshToCache } from "@/modules/source-document/hooks/stream-refresh-cache";

function makeItem(id: string, entryDate: string): SourceDocumentListItemDto {
  return {
    id,
    ledgerId: "ledger-1",
    title: `Doc ${id}`,
    text: null,
    files: [],
    status: "processing",
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
  };
}

function streamData(items: SourceDocumentListItemDto[]): InfiniteData<StreamPage> {
  return {
    pages: [{ items, nextCursor: null, generation: 1 }],
    pageParams: [undefined],
  };
}

describe("stream refresh cache", () => {
  it("keeps the loaded list visible when resetRequired is signalled", () => {
    const client = new QueryClient();
    const key = queryKeys.sourceDocumentStream("ledger-1");
    const items = [makeItem("doc-1", "2026-07-15")];
    client.setQueryData(key, streamData(items));

    applyStreamRefreshToCache(client, "ledger-1", {
      protocolVersion: 2,
      fromVersion: "1",
      toVersion: "5",
      hasMore: false,
      resetRequired: true,
      changed: true,
      hasTransitionalWork: false,
      documents: [],
      tombstones: [],
      counts: { processingCount: 0, attentionCount: 0 },
      invalidations: { categories: true, settings: true, stats: true },
    });

    // The old list survives a reset — only a background refetch is scheduled.
    const data = client.getQueryData<InfiniteData<StreamPage>>(key);
    expect(data?.pages[0]?.items.map((item) => item.id)).toEqual(["doc-1"]);
  });

  it("merges delta documents and tombstones without clearing the window", () => {
    const client = new QueryClient();
    const key = queryKeys.sourceDocumentStream("ledger-1");
    client.setQueryData(key, streamData([makeItem("doc-1", "2026-07-15")]));

    applyStreamRefreshToCache(client, "ledger-1", {
      protocolVersion: 2,
      fromVersion: "1",
      toVersion: "2",
      hasMore: false,
      resetRequired: false,
      changed: true,
      hasTransitionalWork: false,
      documents: [makeItem("doc-2", "2026-07-14")],
      tombstones: ["doc-1"],
      counts: { processingCount: 1, attentionCount: 1 },
      invalidations: { categories: false, settings: false, stats: false },
    });

    const data = client.getQueryData<InfiniteData<StreamPage>>(key);
    expect(data?.pages[0]?.items.map((item) => item.id)).toEqual(["doc-2"]);
    expect(client.getQueryData(queryKeys.sourceDocumentCounts("ledger-1"))).toEqual({
      processingCount: 1,
      attentionCount: 1,
    });
  });
});
