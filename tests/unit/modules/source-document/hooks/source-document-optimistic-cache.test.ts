import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import type { SourceDocumentListItemDto, StreamPage } from "@/modules/source-document/contracts";
import { applyOptimisticUpsert } from "@/modules/source-document/hooks/source-document-optimistic-cache";

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

describe("source document optimistic cache", () => {
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
});
