import { describe, expect, it } from "vitest";
import { createQueryClient } from "tests/fixtures/query-client";
import { applyStreamRefreshToCache } from "@/modules/source-document/hooks/stream-refresh-cache";
import { queryKeys } from "@/lib/query-keys";
import type { StreamRefreshResult } from "@/modules/source-document/contract-refresh";
import type {
  StreamPage,
  SourceDocumentListItemDto,
  SourceDocumentCountsDto,
} from "@/modules/source-document/contracts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createListItem(
  id: string,
  overrides: Partial<SourceDocumentListItemDto> = {}
): SourceDocumentListItemDto {
  return {
    id,
    ledgerId: "ledger-1",
    title: `Doc ${id}`,
    text: null,
    files: [],
    status: "completed",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: "2026-07-24",
    metadata: {},
    createdAt: "2026-07-24T10:00:00.000Z",
    updatedAt: "2026-07-24T10:00:00.000Z",
    deletedAt: null,
    hasImages: false,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: null,
    ...overrides,
  };
}

/**
 * Filter signature for a query with all-null filter params.
 * The format is startDate|endDate|minAmount|maxAmount|statuses.
 * With 4 empty/null parts joined by "|", the result is "|||" (3 pipes).
 */
const EMPTY_FILTER_SIGNATURE = "|||";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("stream-refresh-cache", () => {
  // -----------------------------------------------------------------------
  // Retain older compatible pages
  // -----------------------------------------------------------------------

  it("retains older pages when patching first page", () => {
    const queryClient = createQueryClient();

    const streamKey = ["sourceDocuments", "ledger-1", "stream", null, null, null, null, null];

    // Set up initial infinite query data with 2 pages
    const initialPage1: StreamPage = {
      items: [createListItem("1"), createListItem("2")],
      nextCursor: "page2-cursor",
      generation: 1,
    };
    const initialPage2: StreamPage = {
      items: [createListItem("3"), createListItem("4")],
      nextCursor: null,
      generation: 1,
    };

    queryClient.setQueryData(streamKey, {
      pages: [initialPage1, initialPage2],
      pageParams: [undefined, "page2-cursor"],
    });

    // Apply a refresh that changes the first page
    const result: StreamRefreshResult = {
      protocolVersion: 1,
      generation: 1,
      changed: true,
      hasTransitionalWork: false,
      firstPages: [
        {
          filterSignature: EMPTY_FILTER_SIGNATURE,
          fingerprint: "new-fingerprint",
          page: {
            items: [
              createListItem("1", { updatedAt: "2026-07-24T12:00:00.000Z" }),
              createListItem("5"),
            ],
            nextCursor: "page2-cursor",
            generation: 1,
          },
        },
      ],
      changedWatched: [],
      counts: null,
    };

    applyStreamRefreshToCache(queryClient, "ledger-1", result);

    const data = queryClient.getQueryData<{ pages: StreamPage[]; pageParams: unknown[] }>(
      streamKey
    );

    expect(data).toBeDefined();
    const d = data!;
    expect(d.pages.length).toBe(2);
    expect(d.pages[0]!.items).toHaveLength(2);
    expect(d.pages[0]!.items[0]!.updatedAt).toBe("2026-07-24T12:00:00.000Z");
    expect(d.pages[0]!.items[1]!.id).toBe("5");
  });

  // -----------------------------------------------------------------------
  // Deduplicate identities across pages
  // -----------------------------------------------------------------------

  it("deduplicates identities that moved between pages", () => {
    const queryClient = createQueryClient();

    const streamKey = ["sourceDocuments", "ledger-1", "stream", null, null, null, null, null];

    const initialPage1: StreamPage = {
      items: [createListItem("1"), createListItem("2")],
      nextCursor: "page2-cursor",
      generation: 1,
    };
    const initialPage2: StreamPage = {
      items: [createListItem("3")],
      nextCursor: null,
      generation: 1,
    };

    queryClient.setQueryData(streamKey, {
      pages: [initialPage1, initialPage2],
      pageParams: [undefined, "page2-cursor"],
    });

    const result: StreamRefreshResult = {
      protocolVersion: 1,
      generation: 1,
      changed: true,
      hasTransitionalWork: false,
      firstPages: [
        {
          filterSignature: EMPTY_FILTER_SIGNATURE,
          fingerprint: "fp2",
          page: {
            items: [
              createListItem("1"),
              createListItem("2", { updatedAt: "2026-07-24T13:00:00.000Z" }),
            ],
            nextCursor: "page2-cursor",
            generation: 1,
          },
        },
      ],
      changedWatched: [],
      counts: null,
    };

    applyStreamRefreshToCache(queryClient, "ledger-1", result);

    const queryData = queryClient.getQueryData<{ pages: StreamPage[]; pageParams: unknown[] }>(
      streamKey
    );
    expect(queryData).toBeDefined();
    expect(queryData!.pages[1]!.items).toHaveLength(1);
    expect(queryData!.pages[1]!.items[0]!.id).toBe("3");
  });

  // -----------------------------------------------------------------------
  // Patch open detail cache entries
  // -----------------------------------------------------------------------

  it("patches individual detail cache entries", () => {
    const queryClient = createQueryClient();

    const detailDoc = {
      id: "watched-1",
      ledgerId: "ledger-1",
      title: "Watched Document",
      text: "original text",
      files: [],
      status: "processing",
      type: "ai_parsed",
      anomalyReason: null,
      entryDate: null,
      createdAt: "2026-07-24T10:00:00.000Z",
      updatedAt: "2026-07-24T10:00:00.000Z",
      deletedAt: null,
      ledgerEntries: [],
      hasImages: false,
      supportedActions: [],
      errorCode: null,
      pendingRevisionId: null,
    };

    queryClient.setQueryData(["sourceDocument", "light", "watched-1"], detailDoc);

    const result: StreamRefreshResult = {
      protocolVersion: 1,
      generation: 1,
      changed: true,
      hasTransitionalWork: false,
      firstPages: [],
      changedWatched: [
        {
          id: "watched-1",
          doc: createListItem("watched-1", {
            status: "completed",
            updatedAt: "2026-07-24T14:00:00.000Z",
          }),
          fingerprint: "new-fp",
        },
      ],
      counts: null,
    };

    applyStreamRefreshToCache(queryClient, "ledger-1", result);

    const updated = queryClient.getQueryData<Record<string, unknown>>([
      "sourceDocument",
      "light",
      "watched-1",
    ]);
    expect(updated).toBeDefined();
    if (!updated) return;
    expect(updated.status).toBe("completed");
    expect(updated.updatedAt).toBe("2026-07-24T14:00:00.000Z");
    expect(updated.text).toBe("original text");
    expect(updated.ledgerEntries).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Update global counts
  // -----------------------------------------------------------------------

  it("updates global counts cache", () => {
    const queryClient = createQueryClient();

    queryClient.setQueryData<SourceDocumentCountsDto>(["sourceDocuments", "ledger-1", "counts"], {
      processingCount: 5,
      attentionCount: 3,
    });

    const updatedCounts: StreamRefreshResult["counts"] = {
      processingCount: 2,
      attentionCount: 1,
      fingerprint: "new-count-fp",
    };

    const result: StreamRefreshResult = {
      protocolVersion: 1,
      generation: 1,
      changed: true,
      hasTransitionalWork: false,
      firstPages: [],
      changedWatched: [],
      counts: updatedCounts,
    };

    applyStreamRefreshToCache(queryClient, "ledger-1", result);

    const counts = queryClient.getQueryData<SourceDocumentCountsDto>([
      "sourceDocuments",
      "ledger-1",
      "counts",
    ]);
    expect(counts).toEqual({
      processingCount: 2,
      attentionCount: 1,
    });
  });

  it("invalidates stream totals when refreshed data changes", () => {
    const queryClient = createQueryClient();
    const totalKey = queryKeys.sourceDocumentStreamTotal("ledger-1");
    queryClient.setQueryData(totalKey, { total: "42.00" });

    applyStreamRefreshToCache(queryClient, "ledger-1", {
      protocolVersion: 1,
      generation: 1,
      changed: true,
      hasTransitionalWork: false,
      firstPages: [],
      changedWatched: [],
      counts: null,
    });

    expect(queryClient.getQueryState(totalKey)?.isInvalidated).toBe(true);
  });

  // -----------------------------------------------------------------------
  // No change — no modification
  // -----------------------------------------------------------------------

  it("does not modify cache when result has no changes", () => {
    const queryClient = createQueryClient();

    queryClient.setQueryData<SourceDocumentCountsDto>(["sourceDocuments", "ledger-1", "counts"], {
      processingCount: 3,
      attentionCount: 1,
    });

    const result: StreamRefreshResult = {
      protocolVersion: 1,
      generation: 1,
      changed: false,
      hasTransitionalWork: false,
      firstPages: [],
      changedWatched: [],
      counts: null,
    };

    applyStreamRefreshToCache(queryClient, "ledger-1", result);

    const counts = queryClient.getQueryData<SourceDocumentCountsDto>([
      "sourceDocuments",
      "ledger-1",
      "counts",
    ]);
    expect(counts).toEqual({
      processingCount: 3,
      attentionCount: 1,
    });
  });

  // -----------------------------------------------------------------------
  // Tombstone handling
  // -----------------------------------------------------------------------

  it("clears detail cache for deleted watched entities", () => {
    const queryClient = createQueryClient();

    queryClient.setQueryData(["sourceDocument", "deleted-1"], {
      id: "deleted-1",
      title: "Will be deleted",
    });

    queryClient.setQueryData(["sourceDocument", "light", "deleted-1"], {
      id: "deleted-1",
      title: "Will be deleted",
    });

    const result: StreamRefreshResult = {
      protocolVersion: 1,
      generation: 1,
      changed: true,
      hasTransitionalWork: false,
      firstPages: [],
      changedWatched: [{ id: "deleted-1", doc: null, fingerprint: "" }],
      counts: null,
    };

    applyStreamRefreshToCache(queryClient, "ledger-1", result);

    expect(queryClient.getQueryData(["sourceDocument", "deleted-1"])).toBeNull();
    expect(queryClient.getQueryData(["sourceDocument", "light", "deleted-1"])).toBeNull();
  });
});
