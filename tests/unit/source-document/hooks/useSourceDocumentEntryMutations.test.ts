import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MutationOptions = {
  mutationFn?: (variables: unknown) => Promise<void>;
  onOptimisticUpdate?: (queryClient: QueryClient, variables: unknown) => unknown;
};

const {
  batchDeleteLedgerEntriesActionMock,
  batchUpdateLedgerEntriesActionMock,
  capturedMutations,
  createSourceDocSnapshotsMock,
  deleteLedgerEntryActionMock,
  removeBatchEntriesFromCachesMock,
  removeSingleEntryFromCachesMock,
  updateBatchEntriesInCachesMock,
  updateLedgerEntryActionMock,
  updateSingleEntryInCachesMock,
  useLedgerMutationMock,
} = vi.hoisted(() => ({
  batchDeleteLedgerEntriesActionMock: vi.fn(),
  batchUpdateLedgerEntriesActionMock: vi.fn(),
  capturedMutations: [] as MutationOptions[],
  createSourceDocSnapshotsMock: vi.fn(() => ["snap"]),
  deleteLedgerEntryActionMock: vi.fn(),
  removeBatchEntriesFromCachesMock: vi.fn(),
  removeSingleEntryFromCachesMock: vi.fn(),
  updateBatchEntriesInCachesMock: vi.fn(),
  updateLedgerEntryActionMock: vi.fn(),
  updateSingleEntryInCachesMock: vi.fn(),
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

vi.mock("@/modules/ledger/actions", () => ({
  batchDeleteLedgerEntriesAction: batchDeleteLedgerEntriesActionMock,
  batchUpdateLedgerEntriesAction: batchUpdateLedgerEntriesActionMock,
  deleteLedgerEntryAction: deleteLedgerEntryActionMock,
  updateLedgerEntryAction: updateLedgerEntryActionMock,
}));

vi.mock("@/lib/safe-async", () => ({
  fireAndForget: vi.fn(),
}));

vi.mock("@/lib/mutations/use-ledger-mutation", () => ({
  useLedgerMutation: useLedgerMutationMock,
}));

vi.mock("@/modules/source-document/hooks/source-document-detail-cache", () => ({
  createSourceDocSnapshots: createSourceDocSnapshotsMock,
  removeBatchEntriesFromCaches: removeBatchEntriesFromCachesMock,
  removeSingleEntryFromCaches: removeSingleEntryFromCachesMock,
  updateBatchEntriesInCaches: updateBatchEntriesInCachesMock,
  updateSingleEntryInCaches: updateSingleEntryInCachesMock,
}));

import { useSourceDocumentEntryMutations } from "@/modules/source-document/hooks";

describe("useSourceDocumentEntryMutations", () => {
  beforeEach(() => {
    capturedMutations.length = 0;
    vi.clearAllMocks();
  });

  it("converts amount strings to numbers before calling updateLedgerEntryAction", async () => {
    renderHook(() =>
      useSourceDocumentEntryMutations({
        id: "doc-1",
        ledgerId: "ledger-1",
        sourceDocumentAndEntriesPredicates: [],
        sourceDocumentEntriesSummaryPredicates: [],
      })
    );

    const updateEntryMutation = capturedMutations[0];
    if (updateEntryMutation?.mutationFn == null) {
      throw new Error("Expected update entry mutation");
    }

    await updateEntryMutation.mutationFn({
      entryId: "entry-1",
      data: {
        amount: "10.50",
        itemName: "Tea",
      },
    });

    expect(updateLedgerEntryActionMock).toHaveBeenCalledWith("ledger-1", "entry-1", {
      amount: 10.5,
      itemName: "Tea",
    });
  });

  it("uses cache helpers for optimistic update and batch delete flows", () => {
    renderHook(() =>
      useSourceDocumentEntryMutations({
        id: "doc-1",
        ledgerId: "ledger-1",
        sourceDocumentAndEntriesPredicates: [],
        sourceDocumentEntriesSummaryPredicates: [],
      })
    );

    const queryClient = new QueryClient();
    const updateEntryMutation = capturedMutations[0];
    const batchDeleteMutation = capturedMutations[3];

    if (
      updateEntryMutation?.onOptimisticUpdate == null ||
      batchDeleteMutation?.onOptimisticUpdate == null
    ) {
      throw new Error("Expected optimistic update handlers");
    }

    updateEntryMutation.onOptimisticUpdate(queryClient, {
      entryId: "entry-1",
      data: { itemName: "Updated" },
    });
    batchDeleteMutation.onOptimisticUpdate(queryClient, ["entry-1", "entry-2"]);

    expect(createSourceDocSnapshotsMock).toHaveBeenCalledWith(queryClient, "doc-1", "ledger-1");
    expect(updateSingleEntryInCachesMock).toHaveBeenCalledWith(
      queryClient,
      "doc-1",
      "ledger-1",
      "entry-1",
      { itemName: "Updated" }
    );
    expect(removeBatchEntriesFromCachesMock).toHaveBeenCalledWith(
      queryClient,
      "doc-1",
      "ledger-1",
      ["entry-1", "entry-2"]
    );
  });
});
