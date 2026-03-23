import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import type { EntryCategory } from "@/modules/ledger/contracts";

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

vi.mock("@/lib/mutations/use-ledger-mutation", () => ({
  useLedgerMutation: useLedgerMutationMock,
}));

vi.mock("@/modules/ledger/actions", () => ({
  updateLedgerEntryAction: vi.fn(),
  deleteLedgerEntryAction: vi.fn(),
}));

import { useLedgerEntriesMutations } from "@/modules/ledger/hooks/useLedgerEntriesMutations";

function createCategory(ledgerId: string): EntryCategory {
  return {
    id: "cat-1",
    ledgerId,
    name: "Food",
    description: null,
    icon: null,
    sortOrder: 1,
    isEditable: true,
    createdAt: "2026-03-20T00:00:00.000Z",
    updatedAt: "2026-03-20T00:00:00.000Z",
    deletedAt: null,
  };
}

describe("useLedgerEntriesMutations", () => {
  const ledgerId = "ledger-1";

  beforeEach(() => {
    capturedMutations.length = 0;
    vi.clearAllMocks();
  });

  it("optimistically updates embedded source-document entries via the real hook", () => {
    const categories = [createCategory(ledgerId)];
    const queryClient = new QueryClient();
    const collectionKey = queryKeys.sourceDocumentCollection(ledgerId, { limit: 1000 });

    queryClient.setQueryData(collectionKey, {
      items: [
        {
          id: "doc-1",
          ledgerEntries: [
            {
              id: "entry-1",
              itemName: "Lunch",
              description: "old",
              amount: "10.00",
              currency: "CNY",
              categoryId: null,
              convertedAmount: null,
              exchangeRate: null,
              category: null,
            },
          ],
        },
        { id: "doc-2" },
      ],
      hasMore: false,
      total: 2,
    } as never);

    renderHook(() => useLedgerEntriesMutations(ledgerId, categories));

    const updateMutation = capturedMutations[0];
    if (updateMutation?.onOptimisticUpdate == null) {
      throw new Error("Expected update mutation");
    }

    const context = updateMutation.onOptimisticUpdate(queryClient, {
      ledgerEntryId: "entry-1",
      data: {
        itemName: "Dinner",
        description: "updated",
        amount: 20,
        currency: "USD",
        categoryId: "cat-1",
      },
    }) as { snapshots: unknown[] };

    expect(queryClient.getQueryData(collectionKey)).toMatchObject({
      items: [
        {
          id: "doc-1",
          ledgerEntries: [
            {
              id: "entry-1",
              itemName: "Dinner",
              description: "updated",
              amount: "20",
              currency: "USD",
              categoryId: "cat-1",
              category: { id: "cat-1", name: "Food" },
            },
          ],
        },
        { id: "doc-2" },
      ],
    });
    expect(context.snapshots).toHaveLength(1);
  });

  it("leaves malformed source-document collection cache untouched", () => {
    const queryClient = new QueryClient();
    const collectionKey = queryKeys.sourceDocumentCollection(ledgerId, { limit: 1000 });
    queryClient.setQueryData(collectionKey, [{ id: "doc-1" }]);

    renderHook(() => useLedgerEntriesMutations(ledgerId, [createCategory(ledgerId)]));

    const deleteMutation = capturedMutations[1];
    if (deleteMutation?.onOptimisticUpdate == null) {
      throw new Error("Expected delete mutation");
    }

    expect(() => deleteMutation.onOptimisticUpdate?.(queryClient, "entry-1")).not.toThrow();
    expect(queryClient.getQueryData(collectionKey)).toEqual([{ id: "doc-1" }]);
  });
});
