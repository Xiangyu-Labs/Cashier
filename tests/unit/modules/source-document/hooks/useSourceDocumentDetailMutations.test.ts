import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import { useSourceDocumentDetailMutations } from "@/modules/source-document/hooks/useSourceDocumentDetailMutations";

type MutationOptions = {
  cancelPredicates?: Array<(query: { queryKey: readonly unknown[] }) => boolean>;
  invalidatePredicates?: Array<(query: { queryKey: readonly unknown[] }) => boolean>;
  onOptimisticUpdate?: (queryClient: QueryClient, variables: unknown) => unknown;
  onSuccessExtra?: (data: unknown, variables: unknown, context: unknown) => void;
  successMessage?: string | null;
  errorMessage?: string | null;
};

const capturedMutations: MutationOptions[] = [];

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/mutations/use-ledger-mutation", () => ({
  useLedgerMutation: vi.fn((_ledgerId: string | undefined, options: MutationOptions) => {
    capturedMutations.push(options);
    return {
      mutateAsync: vi.fn(),
    };
  }),
  createListSnapshots: (queryClient: QueryClient, queryKey: readonly unknown[]) =>
    queryClient.getQueriesData({ queryKey }),
}));

function createSourceDocument(ledgerId: string, id: string) {
  return {
    id,
    ledgerId,
    title: "Receipt",
    text: "Details",
    imageUrls: ["base64-image"],
    status: "completed",
    type: "ai_parsed",
    anomalyReason: null,
    entryDate: "2026-03-20",
    metadata: {},
    createdAt: "2026-03-20T00:00:00.000Z",
    updatedAt: "2026-03-20T00:00:00.000Z",
    deletedAt: null,
    ledgerEntries: [],
    hasImages: true,
  };
}

describe("useSourceDocumentDetailMutations", () => {
  beforeEach(() => {
    capturedMutations.length = 0;
  });

  it("optimistically removes deleted documents from detail, light, and list caches", () => {
    const ledgerId = "ledger-1";
    const targetId = "doc-1";
    const otherId = "doc-2";

    renderHook(() =>
      useSourceDocumentDetailMutations({
        id: targetId,
        ledgerId,
        onClose: vi.fn(),
      })
    );

    const deleteCandidates = capturedMutations.filter(
      (options) => typeof options.onSuccessExtra === "function"
    );
    expect(deleteCandidates).toHaveLength(1);
    const [deleteDocumentMutation] = deleteCandidates;
    if (deleteDocumentMutation == null) {
      throw new Error("Expected delete document mutation");
    }
    expect(typeof deleteDocumentMutation.onOptimisticUpdate).toBe("function");

    const queryClient = new QueryClient();

    queryClient.setQueryData(queryKeys.sourceDocument(targetId), createSourceDocument(ledgerId, targetId));
    queryClient.setQueryData(queryKeys.sourceDocumentLight(targetId), createSourceDocument(ledgerId, targetId));
    queryClient.setQueryData(queryKeys.sourceDocumentCollection(ledgerId, { limit: 1000 }), {
      items: [createSourceDocument(ledgerId, targetId), createSourceDocument(ledgerId, otherId)],
      hasMore: false,
      total: 2,
    });

    deleteDocumentMutation.onOptimisticUpdate?.(queryClient, undefined);

    expect(queryClient.getQueryData(queryKeys.sourceDocument(targetId))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.sourceDocumentLight(targetId))).toBeUndefined();

    const listCache = queryClient.getQueryData<{
      items: Array<{ id: string }>;
      total: number;
    }>(queryKeys.sourceDocumentCollection(ledgerId, { limit: 1000 }));
    expect(listCache).toBeDefined();
    expect(listCache?.items.map((item) => item.id)).toEqual([otherId]);
    expect(listCache?.total).toBe(1);
  });

  it("optimistically updates image caches for detail, light, and list entries", () => {
    const ledgerId = "ledger-2";
    const targetId = "doc-10";
    const otherId = "doc-11";

    renderHook(() =>
      useSourceDocumentDetailMutations({
        id: targetId,
        ledgerId,
        onClose: vi.fn(),
      })
    );

    const updateImagesMutation = capturedMutations.find(
      (options) => options.successMessage === "saveSuccess"
    );
    expect(updateImagesMutation).toBeDefined();
    expect(typeof updateImagesMutation?.onOptimisticUpdate).toBe("function");

    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.sourceDocument(targetId), createSourceDocument(ledgerId, targetId));
    queryClient.setQueryData(queryKeys.sourceDocumentLight(targetId), createSourceDocument(ledgerId, targetId));
    queryClient.setQueryData(queryKeys.sourceDocumentCollection(ledgerId, { limit: 1000 }), {
      items: [createSourceDocument(ledgerId, targetId), createSourceDocument(ledgerId, otherId)],
      hasMore: false,
      total: 2,
    });

    updateImagesMutation?.onOptimisticUpdate?.(queryClient, { images: [] });

    const detail = queryClient.getQueryData<{ imageUrls: string[] }>(queryKeys.sourceDocument(targetId));
    const light = queryClient.getQueryData<{ hasImages: boolean }>(queryKeys.sourceDocumentLight(targetId));
    const list = queryClient.getQueryData<{
      items: Array<{ id: string; imageUrls: unknown[]; hasImages: boolean }>;
    }>(queryKeys.sourceDocumentCollection(ledgerId, { limit: 1000 }));

    expect(detail?.imageUrls).toEqual([]);
    expect(light?.hasImages).toBe(false);
    expect(list?.items.find((doc) => doc.id === targetId)).toMatchObject({
      imageUrls: [],
      hasImages: false,
    });
    expect(list?.items.find((doc) => doc.id === otherId)?.hasImages).toBe(true);
  });

  it("optimistically deletes one ledger entry and keeps entry invalidation families wired", () => {
    const ledgerId = "ledger-3";
    const targetId = "doc-20";

    renderHook(() =>
      useSourceDocumentDetailMutations({
        id: targetId,
        ledgerId,
        onClose: vi.fn(),
      })
    );

    const deleteEntryMutation = capturedMutations.find(
      (options) =>
        options.successMessage === "deleteSuccess" &&
        options.onSuccessExtra == null &&
        (options.onOptimisticUpdate?.toString().includes("entryId") ?? false)
    );
    expect(deleteEntryMutation).toBeDefined();
    expect(typeof deleteEntryMutation?.onOptimisticUpdate).toBe("function");

    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.sourceDocument(targetId), {
      ...createSourceDocument(ledgerId, targetId),
      ledgerEntries: [
        { id: "entry-1", itemName: "A", amount: "1.00" },
        { id: "entry-2", itemName: "B", amount: "2.00" },
      ],
    });
    queryClient.setQueryData(queryKeys.sourceDocumentCollection(ledgerId, { limit: 1000 }), {
      items: [
        {
          ...createSourceDocument(ledgerId, targetId),
          ledgerEntries: [
            { id: "entry-1", itemName: "A", amount: "1.00" },
            { id: "entry-2", itemName: "B", amount: "2.00" },
          ],
        },
      ],
      hasMore: false,
      total: 1,
    });

    deleteEntryMutation?.onOptimisticUpdate?.(queryClient, "entry-1");

    const detail = queryClient.getQueryData<{ ledgerEntries: Array<{ id: string }> }>(
      queryKeys.sourceDocument(targetId)
    );
    const list = queryClient.getQueryData<{
      items: Array<{ id: string; ledgerEntries?: Array<{ id: string }> }>;
    }>(queryKeys.sourceDocumentCollection(ledgerId, { limit: 1000 }));

    expect(detail?.ledgerEntries.map((entry) => entry.id)).toEqual(["entry-2"]);
    expect(list?.items[0]?.ledgerEntries?.map((entry) => entry.id)).toEqual(["entry-2"]);

    const invalidatePredicates = deleteEntryMutation?.invalidatePredicates ?? [];
    expect(
      invalidatePredicates.some((predicate) =>
        predicate({ queryKey: queryKeys.sourceDocumentCollection(ledgerId, { limit: 1000 }) })
      )
    ).toBe(true);
    expect(
      invalidatePredicates.some((predicate) =>
        predicate({ queryKey: queryKeys.ledgerEntries(ledgerId) })
      )
    ).toBe(true);
    expect(
      invalidatePredicates.some((predicate) =>
        predicate({ queryKey: queryKeys.summary(ledgerId) })
      )
    ).toBe(true);
    expect(
      invalidatePredicates.some((predicate) =>
        predicate({ queryKey: queryKeys.calendarHeatmap(ledgerId, "month", "2026-03-20") })
      )
    ).toBe(true);
  });
});
