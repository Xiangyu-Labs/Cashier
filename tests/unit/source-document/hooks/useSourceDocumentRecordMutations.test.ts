import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";

type MutationOptions = {
  onOptimisticUpdate?: (queryClient: QueryClient, variables: unknown) => unknown;
  onSuccessExtra?: () => void;
};

const {
  capturedMutations,
  createSourceDocSnapshotsMock,
  fireAndForgetMock,
  useLedgerMutationMock,
} = vi.hoisted(() => ({
  capturedMutations: [] as MutationOptions[],
  createSourceDocSnapshotsMock: vi.fn(() => ["snap"]),
  fireAndForgetMock: vi.fn(),
  useLedgerMutationMock: vi.fn((_ledgerId: string | undefined, options: MutationOptions) => {
    capturedMutations.push(options);
    return {
      mutate: vi.fn(),
    };
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/safe-async", () => ({
  fireAndForget: fireAndForgetMock,
}));

vi.mock("@/lib/mutations/use-ledger-mutation", () => ({
  useLedgerMutation: useLedgerMutationMock,
}));

vi.mock("@/modules/source-document/actions", () => ({
  deleteSourceDocumentAction: vi.fn(),
  updateSourceDocumentAction: vi.fn(),
  updateSourceDocumentImagesAction: vi.fn(),
}));

vi.mock("@/modules/source-document/hooks/source-document-detail-cache", () => ({
  createSourceDocSnapshots: createSourceDocSnapshotsMock,
  updateSourceDocumentCollectionLists: (
    queryClient: QueryClient,
    ledgerId: string,
    updater: (doc: Record<string, unknown>) => Record<string, unknown> | null
  ) =>
    queryClient.setQueriesData(
      { queryKey: queryKeys.sourceDocumentCollectionPrefix(ledgerId) },
      (old: { items: Array<Record<string, unknown>> } | undefined) =>
        old == null
          ? old
          : {
              ...old,
              items: old.items
                .map((doc) => updater(doc))
                .filter((doc): doc is Record<string, unknown> => doc !== null),
            }
    ),
}));

import { useSourceDocumentRecordMutations } from "@/modules/source-document/hooks";

describe("useSourceDocumentRecordMutations", () => {
  beforeEach(() => {
    capturedMutations.length = 0;
    vi.clearAllMocks();
  });

  it("optimistically updates detail, light, and paginated list caches for title changes", () => {
    renderHook(() =>
      useSourceDocumentRecordMutations({
        id: "doc-1",
        ledgerId: "ledger-1",
        onClose: vi.fn(),
        sourceDocumentPredicates: [],
        sourceDocumentSummaryPredicates: [],
        sourceDocumentEntriesSummaryPredicates: [],
      })
    );

    const updateMutation = capturedMutations[0];
    if (updateMutation?.onOptimisticUpdate == null) {
      throw new Error("Expected update mutation");
    }

    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.sourceDocument("doc-1"), { id: "doc-1", title: "Old" });
    queryClient.setQueryData(queryKeys.sourceDocumentLight("doc-1"), {
      id: "doc-1",
      title: "Old",
    });
    queryClient.setQueryData(queryKeys.sourceDocumentCollection("ledger-1", { limit: 1000 }), {
      items: [{ id: "doc-1", title: "Old" }],
      total: 1,
    });

    updateMutation.onOptimisticUpdate(queryClient, {
      title: "New",
      entryDate: "2026-03-20",
    });

    expect(queryClient.getQueryData(queryKeys.sourceDocument("doc-1"))).toMatchObject({
      title: "New",
      entryDate: "2026-03-20",
    });
    expect(queryClient.getQueryData(queryKeys.sourceDocumentLight("doc-1"))).toMatchObject({
      title: "New",
    });
    expect(
      queryClient.getQueryData(queryKeys.sourceDocumentCollection("ledger-1", { limit: 1000 }))
    ).toMatchObject({ items: [{ id: "doc-1", title: "New", entryDate: "2026-03-20" }] });
    expect(createSourceDocSnapshotsMock).toHaveBeenCalledWith(queryClient, "doc-1", "ledger-1");
  });

  it("optimistically removes detail/light/list caches and closes on delete success", () => {
    const onClose = vi.fn();
    renderHook(() =>
      useSourceDocumentRecordMutations({
        id: "doc-1",
        ledgerId: "ledger-1",
        onClose,
        sourceDocumentPredicates: [],
        sourceDocumentSummaryPredicates: [],
        sourceDocumentEntriesSummaryPredicates: [],
      })
    );

    const deleteMutation = capturedMutations[2];
    if (deleteMutation?.onOptimisticUpdate == null || deleteMutation.onSuccessExtra == null) {
      throw new Error("Expected delete mutation");
    }

    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.sourceDocument("doc-1"), { id: "doc-1" });
    queryClient.setQueryData(queryKeys.sourceDocumentLight("doc-1"), { id: "doc-1" });
    queryClient.setQueryData(queryKeys.sourceDocumentCollection("ledger-1", { limit: 1000 }), {
      items: [{ id: "doc-1" }, { id: "doc-2" }],
      total: 2,
    });

    deleteMutation.onOptimisticUpdate(queryClient, undefined);
    deleteMutation.onSuccessExtra();

    expect(queryClient.getQueryData(queryKeys.sourceDocument("doc-1"))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.sourceDocumentLight("doc-1"))).toBeUndefined();
    expect(
      queryClient.getQueryData(queryKeys.sourceDocumentCollection("ledger-1", { limit: 1000 }))
    ).toEqual({ items: [{ id: "doc-2" }], total: 1 });
    expect(onClose).toHaveBeenCalled();
  });
});
