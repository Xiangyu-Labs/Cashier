import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";

type MutationOptions = {
  onOptimisticUpdate?: (queryClient: QueryClient, variables: unknown) => unknown;
};

const { capturedMutations, useLedgerMutationMock } = vi.hoisted(() => ({
  capturedMutations: [] as MutationOptions[],
  useLedgerMutationMock: vi.fn((_ledgerId: string, options: MutationOptions) => {
    capturedMutations.push(options);
    return {
      mutate: vi.fn(),
      isPending: false,
    };
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
  },
}));

vi.mock("@/lib/mutations/use-ledger-mutation", () => ({
  useLedgerMutation: useLedgerMutationMock,
}));

vi.mock("@/modules/source-document/actions", () => ({
  deleteSourceDocumentAction: vi.fn(),
  batchUpdateSourceDocumentsAction: vi.fn(),
  batchDeleteSourceDocumentsAction: vi.fn(),
  batchRetrySourceDocumentsAction: vi.fn(),
}));

import { useBatchSourceDocumentActions } from "@/modules/source-document/hooks/useBatchSourceDocumentActions";

function createSourceDocument(ledgerId: string, id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    ledgerId,
    title: null,
    text: null,
    imageUrls: [],
    status: "completed",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: "2026-03-20",
    metadata: {},
    createdAt: "2026-03-20T00:00:00.000Z",
    updatedAt: "2026-03-20T00:00:00.000Z",
    deletedAt: null,
    hasImages: false,
    ...overrides,
  };
}

describe("useBatchSourceDocumentActions", () => {
  const ledgerId = "ledger-1";

  beforeEach(() => {
    capturedMutations.length = 0;
    vi.clearAllMocks();
  });

  it("optimistically updates entry dates in source-document collections", () => {
    const queryClient = new QueryClient();
    const collectionKey = queryKeys.sourceDocumentCollection(ledgerId, { limit: 1000 });
    queryClient.setQueryData(collectionKey, {
      items: [
        createSourceDocument(ledgerId, "doc-1"),
        createSourceDocument(ledgerId, "doc-2"),
      ],
      hasMore: false,
      total: 2,
    });

    renderHook(() => useBatchSourceDocumentActions(ledgerId, vi.fn()));

    const batchUpdateDates = capturedMutations[1];
    if (batchUpdateDates?.onOptimisticUpdate == null) {
      throw new Error("Expected batchUpdateDates mutation");
    }

    batchUpdateDates.onOptimisticUpdate(queryClient, {
      ids: ["doc-1"],
      entryDate: "2026-03-25",
    });

    expect(queryClient.getQueryData(collectionKey)).toMatchObject({
      items: [{ id: "doc-1", entryDate: "2026-03-25" }, { id: "doc-2", entryDate: "2026-03-20" }],
    });
  });

  it("optimistically removes deleted source documents and clamps totals at zero", () => {
    const queryClient = new QueryClient();
    const collectionKey = queryKeys.sourceDocumentCollection(ledgerId, { limit: 1000 });
    queryClient.setQueryData(collectionKey, {
      items: [createSourceDocument(ledgerId, "doc-1")],
      hasMore: false,
      total: 1,
    });

    renderHook(() => useBatchSourceDocumentActions(ledgerId, vi.fn()));

    const batchDelete = capturedMutations[2];
    if (batchDelete?.onOptimisticUpdate == null) {
      throw new Error("Expected batchDelete mutation");
    }

    batchDelete.onOptimisticUpdate(queryClient, ["doc-1", "doc-2"]);

    expect(queryClient.getQueryData(collectionKey)).toMatchObject({
      items: [],
      total: 0,
    });
  });

  it("optimistically marks retried source documents as queued", () => {
    const queryClient = new QueryClient();
    const collectionKey = queryKeys.sourceDocumentCollection(ledgerId, { limit: 1000 });
    queryClient.setQueryData(collectionKey, {
      items: [
        createSourceDocument(ledgerId, "doc-1", { status: "failed" }),
        createSourceDocument(ledgerId, "doc-2", { status: "completed" }),
      ],
      hasMore: false,
      total: 2,
    });

    renderHook(() => useBatchSourceDocumentActions(ledgerId, vi.fn()));

    const batchRetry = capturedMutations[3];
    if (batchRetry?.onOptimisticUpdate == null) {
      throw new Error("Expected batchRetry mutation");
    }

    batchRetry.onOptimisticUpdate(queryClient, ["doc-1"]);

    expect(queryClient.getQueryData(collectionKey)).toMatchObject({
      items: [{ id: "doc-1", status: "queued" }, { id: "doc-2", status: "completed" }],
    });
  });

  it.each([
    [1, { ids: ["doc-1"], entryDate: "2026-03-25" }],
    [2, ["doc-1"]],
    [3, ["doc-1"]],
  ])("leaves malformed collection cache untouched for mutation index %i", (index, variables) => {
    const queryClient = new QueryClient();
    const collectionKey = queryKeys.sourceDocumentCollection(ledgerId, { limit: 1000 });
    queryClient.setQueryData(collectionKey, [{ id: "doc-1" }]);

    renderHook(() => useBatchSourceDocumentActions(ledgerId, vi.fn()));

    const mutation = capturedMutations[index];
    if (mutation?.onOptimisticUpdate == null) {
      throw new Error(`Expected mutation ${index}`);
    }

    expect(() => mutation.onOptimisticUpdate?.(queryClient, variables)).not.toThrow();
    expect(queryClient.getQueryData(collectionKey)).toEqual([{ id: "doc-1" }]);
  });
});
