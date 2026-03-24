import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import { createQuickEntryAction } from "@/modules/source-document/actions";
import { useQuickEntryFormController } from "@/modules/source-document/hooks/useQuickEntryFormController";
import type { EntryCategory } from "@/modules/ledger/contracts";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/modules/source-document/actions", () => ({
  createQuickEntryAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function createCategory(overrides: Partial<EntryCategory> = {}): EntryCategory {
  return {
    id: "cat-1",
    ledgerId: "ledger-1",
    name: "Meals",
    description: null,
    icon: "utensils",
    sortOrder: 1,
    isEditable: true,
    createdAt: "2026-03-23T00:00:00.000Z",
    updatedAt: "2026-03-23T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useQuickEntryFormController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onSuccess immediately when submitting quick entry", async () => {
    const deferred = createDeferred<{ id: string }>();
    vi.mocked(createQuickEntryAction).mockReturnValue(deferred.promise as never);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const onSuccess = vi.fn();

    const { result } = renderHook(
      () =>
        useQuickEntryFormController({
          ledgerId: "ledger-1",
          categories: [createCategory()],
          mainCurrency: "CNY",
          onSuccess,
        }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    act(() => {
      result.current.setSelectedCategoryId("cat-1");
      result.current.setAmount(23);
    });

    act(() => {
      result.current.handleSubmit();
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(createQuickEntryAction).toHaveBeenCalledTimes(1);
    });

    deferred.resolve({ id: "entry-1" });
    await deferred.promise;
  });

  it("defaults currency to mainCurrency and submits the selected currency", async () => {
    vi.mocked(createQuickEntryAction).mockResolvedValue({ ledgerEntryId: "entry-1" } as never);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { result } = renderHook(
      () =>
        useQuickEntryFormController({
          ledgerId: "ledger-1",
          categories: [createCategory()],
          mainCurrency: "MYR",
        }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    expect(result.current.currency).toBe("MYR");

    act(() => {
      result.current.setSelectedCategoryId("cat-1");
      result.current.setCurrency("USD");
      result.current.setAmount(14.54);
    });

    act(() => {
      result.current.handleSubmit();
    });

    await waitFor(() => {
      expect(createQuickEntryAction).toHaveBeenCalledWith(
        "ledger-1",
        expect.objectContaining({ currency: "USD", amount: 14.54 })
      );
    });
  });

  it("uses the selected currency in optimistic entries and does not fake convertedAmount", async () => {
    const deferred = createDeferred<{ ledgerEntryId: string }>();
    vi.mocked(createQuickEntryAction).mockReturnValue(deferred.promise as never);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    queryClient.setQueryData(queryKeys.sourceDocumentCollection("ledger-1"), {
      items: [],
      nextCursor: null,
      total: 0,
    });
    queryClient.setQueryData(queryKeys.ledgerEntries("ledger-1"), {
      pages: [{ items: [] }],
      pageParams: [],
    });

    const { result } = renderHook(
      () =>
        useQuickEntryFormController({
          ledgerId: "ledger-1",
          categories: [createCategory()],
          mainCurrency: "MYR",
        }),
      {
        wrapper: createWrapper(queryClient),
      }
    );

    act(() => {
      result.current.setSelectedCategoryId("cat-1");
      result.current.setCurrency("USD");
      result.current.setAmount(14.54);
    });

    act(() => {
      result.current.handleSubmit();
    });

    await waitFor(() => {
      const optimisticEntries = queryClient.getQueryData<{
        pages: Array<{ items: Array<{ currency: string | null; convertedAmount: string | null }> }>;
      }>(queryKeys.ledgerEntries("ledger-1"));

      expect(optimisticEntries?.pages[0]?.items[0]).toMatchObject({
        currency: "USD",
        convertedAmount: null,
      });
    });

    deferred.resolve({ ledgerEntryId: "entry-1" });
    await deferred.promise;
  });
});
