import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { queryKeys } from "@/lib/query-keys";
import type {
  EntryCategoryDto as EntryCategory,
  LedgerEntryDto as LedgerEntry,
} from "@/modules/ledger/contracts";

const { createListSnapshotsMock, mutationOptions, useLedgerMutationMock } = vi.hoisted(() => ({
  createListSnapshotsMock: vi.fn((queryClient: QueryClient, queryKey: readonly unknown[]) =>
    queryClient.getQueriesData({ queryKey })
  ),
  mutationOptions: [] as Array<Record<string, unknown>>,
  useLedgerMutationMock: vi.fn((_ledgerId: string, options: Record<string, unknown>) => {
    mutationOptions.push(options);
    return { mutate: vi.fn(), isPending: false };
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/mutations/use-ledger-mutation", () => ({
  useLedgerMutation: useLedgerMutationMock,
  createListSnapshots: createListSnapshotsMock,
}));

vi.mock("@/modules/ledger/actions", () => ({
  updateLedgerEntryAction: vi.fn(),
  deleteLedgerEntryAction: vi.fn(),
}));

import { useEntryMutations } from "@/modules/ledger/hooks/useEntryMutations";

function getOption(index: number) {
  const option = mutationOptions[index];
  if (option == null) {
    throw new Error(`Missing mutation option ${index}`);
  }
  return option;
}

describe("useEntryMutations", () => {
  const ledgerId = "ledger-1";
  const categories: EntryCategory[] = [
    {
      id: "cat-1",
      ledgerId,
      name: "餐饮",
      description: null,
      icon: null,
      sortOrder: 1,
      isEditable: true,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      deletedAt: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mutationOptions.length = 0;
  });

  it("optimistically updates cached pages and the selected entry", () => {
    const selectedEntry: LedgerEntry = {
      id: "entry-1",
      ledgerId,
      categoryId: null,
      sourceDocumentId: "doc-1",
      amount: "10.00",
      currency: "CNY",
      itemName: "午餐",
      description: null,
      convertedAmount: null,
      exchangeRate: null,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      deletedAt: null,
      category: null,
    };
    const setSelectedLedgerEntry = vi.fn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.ledgerEntries(ledgerId, "details"), {
      pages: [{ items: [selectedEntry] }],
      pageParams: [],
    });

    renderHook(() =>
      useEntryMutations({
        ledgerId,
        categories,
        selectedLedgerEntry: selectedEntry,
        setSelectedLedgerEntry,
        setIsDetailModalOpen: vi.fn(),
      })
    );

    const updateEntry = getOption(0);
    (
      updateEntry.onOptimisticUpdate as (
        queryClient: QueryClient,
        variables: {
          ledgerEntryId: string;
          data: { itemName: string; amount: number; categoryId: string };
        }
      ) => unknown
    )(queryClient, {
      ledgerEntryId: "entry-1",
      data: {
        itemName: "晚餐",
        amount: 20,
        categoryId: "cat-1",
      },
    });

    const updated = queryClient.getQueryData<{ pages: Array<{ items?: LedgerEntry[] }> }>(
      queryKeys.ledgerEntries(ledgerId, "details")
    );

    expect(updated?.pages[0]?.items?.[0]?.itemName).toBe("晚餐");
    expect(updated?.pages[0]?.items?.[0]?.amount).toBe("20");
    expect(updated?.pages[0]?.items?.[0]?.categoryId).toBe("cat-1");
    expect(setSelectedLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        itemName: "晚餐",
        amount: "20",
        categoryId: "cat-1",
      })
    );
  });

  it("optimistically removes deleted entries and clears modal state on success", () => {
    const setSelectedLedgerEntry = vi.fn();
    const setIsDetailModalOpen = vi.fn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.ledgerEntries(ledgerId, "details"), {
      pages: [{ items: [{ id: "entry-1" }, { id: "entry-2" }] }],
      pageParams: [],
    });

    renderHook(() =>
      useEntryMutations({
        ledgerId,
        categories,
        selectedLedgerEntry: null,
        setSelectedLedgerEntry,
        setIsDetailModalOpen,
      })
    );

    const deleteEntry = getOption(1);
    (
      deleteEntry.onOptimisticUpdate as (queryClient: QueryClient, ledgerEntryId: string) => unknown
    )(queryClient, "entry-1");

    const updated = queryClient.getQueryData<{ pages: Array<{ items?: Array<{ id: string }> }> }>(
      queryKeys.ledgerEntries(ledgerId, "details")
    );
    expect(updated?.pages[0]?.items?.map((entry) => entry.id)).toEqual(["entry-2"]);

    (deleteEntry.onSuccessExtra as () => void)();
    expect(setIsDetailModalOpen).toHaveBeenCalledWith(false);
    expect(setSelectedLedgerEntry).toHaveBeenCalledWith(null);
  });
});
