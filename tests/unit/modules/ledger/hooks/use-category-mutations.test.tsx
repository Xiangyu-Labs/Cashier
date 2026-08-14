import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCategoryMutations } from "@/modules/ledger/hooks/useCategoryMutations";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { queryKeys } from "@/lib/query-keys";

const {
  createEntryCategoryActionMock,
  updateEntryCategoryActionMock,
  reorderEntryCategoriesActionMock,
  generateEntryCategoryMetadataActionMock,
} = vi.hoisted(() => ({
  createEntryCategoryActionMock: vi.fn(),
  updateEntryCategoryActionMock: vi.fn(),
  reorderEntryCategoriesActionMock: vi.fn(),
  generateEntryCategoryMetadataActionMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/modules/ledger/server-actions/categories", () => ({
  createEntryCategoryAction: createEntryCategoryActionMock,
  updateEntryCategoryAction: updateEntryCategoryActionMock,
  deleteEntryCategoryAction: vi.fn(),
  reorderEntryCategoriesAction: reorderEntryCategoriesActionMock,
}));

vi.mock("@/modules/ledger/server-actions/category-metadata", () => ({
  generateEntryCategoryMetadataAction: generateEntryCategoryMetadataActionMock,
}));

const categories: EntryCategory[] = [
  {
    id: "category-1",
    ledgerId: "ledger-1",
    name: "Food",
    sortOrder: 0,
    icon: null,
    description: null,
    isEditable: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    deletedAt: null,
  },
  {
    id: "category-2",
    ledgerId: "ledger-1",
    name: "Travel",
    sortOrder: 1,
    icon: null,
    description: null,
    isEditable: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    deletedAt: null,
  },
];

function createWrapper(queryClient: QueryClient) {
  return function CategoryMutationsTestWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("useCategoryMutations failure recovery and invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateEntryCategoryMetadataActionMock.mockResolvedValue({ categoryId: "category-1" });
  });

  it("refetches categories after a failed create", async () => {
    const queryClient = createQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    createEntryCategoryActionMock.mockRejectedValue(new Error("create failed"));
    const { result } = renderHook(() => useCategoryMutations("ledger-1", categories), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(result.current.createCategory.mutateAsync({ name: "New" })).rejects.toThrow(
        "create failed"
      );
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
    const predicate = invalidate.mock.calls[0]![0]!.predicate;
    const match = (key: readonly unknown[]) =>
      predicate?.({
        queryKey: key,
      } as unknown as Parameters<NonNullable<typeof predicate>>[0]);
    expect(match(["entryCategories", "ledger-1"])).toBe(true);
    expect(match(["entryCategories", "ledger-2"])).toBe(false);
  });

  it("refetches categories after a failed update", async () => {
    const queryClient = createQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    updateEntryCategoryActionMock.mockRejectedValue(new Error("update failed"));
    const { result } = renderHook(() => useCategoryMutations("ledger-1", categories), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await expect(
        result.current.updateCategory.mutateAsync({ id: "category-1", data: { name: "Renamed" } })
      ).rejects.toThrow("update failed");
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
    const predicate = invalidate.mock.calls[0]![0]!.predicate;
    expect(
      predicate?.({
        queryKey: ["entryCategories", "ledger-1"],
      } as unknown as Parameters<NonNullable<typeof predicate>>[0])
    ).toBe(true);
  });

  it("preserves the cached entry count when reconciling an authoritative category update", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.entryCategories("ledger-1"), [
      { ...categories[0]!, entryCount: 7 },
    ]);
    updateEntryCategoryActionMock.mockResolvedValue({
      ...categories[0]!,
      name: "Dining",
      updatedAt: "2026-08-07T00:00:00.000Z",
    });
    const { result } = renderHook(() => useCategoryMutations("ledger-1", categories), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.updateCategory.mutateAsync({
        id: "category-1",
        data: { name: "Dining" },
      });
    });

    expect(queryClient.getQueryData(queryKeys.entryCategories("ledger-1"))).toEqual([
      expect.objectContaining({ id: "category-1", name: "Dining", entryCount: 7 }),
    ]);
  });

  it("declares full invalidation for reorder instead of manual refresh", async () => {
    const queryClient = createQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    reorderEntryCategoriesActionMock.mockResolvedValue({
      categoryIds: ["category-2", "category-1"],
    });
    const { result } = renderHook(() => useCategoryMutations("ledger-1", categories), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.reorderCategories.mutateAsync(["category-2", "category-1"]);
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
    const matchedKeys = invalidate.mock.calls.map((call) => {
      const predicate = call[0]!.predicate;
      return [
        ["entryCategories", "ledger-1"],
        ["ledgerEntries", "ledger-1", "pending"],
        ["sourceDocuments", "ledger-1", "stream"],
        ["summary", "ledger-1"],
      ].filter(
        (key) =>
          predicate?.({
            queryKey: key,
          } as unknown as Parameters<NonNullable<typeof predicate>>[0]) === true
      );
    });
    expect(matchedKeys.flat()).toEqual([
      ["entryCategories", "ledger-1"],
      ["ledgerEntries", "ledger-1", "pending"],
      ["sourceDocuments", "ledger-1", "stream"],
      ["summary", "ledger-1"],
    ]);
  });

  it("keeps loading until all same-category requests settle and ignores an older failure", async () => {
    const first = deferred<{ categoryId: string }>();
    const second = deferred<{ categoryId: string }>();
    generateEntryCategoryMetadataActionMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useCategoryMutations("ledger-1", categories), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      result.current.retryCategoryMetadata("category-1");
      result.current.retryCategoryMetadata("category-1");
    });
    expect(result.current.generatingCategoryIds.has("category-1")).toBe(true);

    await act(async () => {
      first.reject(new Error("older request failed"));
      await first.promise.catch(() => undefined);
    });
    expect(result.current.generatingCategoryIds.has("category-1")).toBe(true);
    expect(result.current.failedCategoryIds.has("category-1")).toBe(false);

    await act(async () => {
      second.resolve({ categoryId: "category-1" });
      await second.promise;
    });
    await waitFor(() => expect(result.current.generatingCategoryIds.has("category-1")).toBe(false));
    expect(result.current.failedCategoryIds.has("category-1")).toBe(false);
  });
});
