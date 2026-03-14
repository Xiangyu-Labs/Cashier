import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { useCategoryMutations } from "@/features/ledger/client/hooks/use-category-mutations";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import React from "react";

// Mock the server actions
vi.mock("@/features/ledger/server/actions/categories", () => ({
  createEntryCategoryAction: vi.fn().mockResolvedValue({ id: "new-cat", name: "New Category" }),
  updateEntryCategoryAction: vi.fn().mockResolvedValue(undefined),
  deleteEntryCategoryAction: vi.fn().mockResolvedValue(undefined),
  reorderEntryCategoriesAction: vi.fn().mockResolvedValue(undefined),
  getEntryCategoriesAction: vi.fn().mockResolvedValue([]),
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Category mutations optimistic updates", () => {
  let queryClient: QueryClient;
  const ledgerId = "ledger-test-123";

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Initialize the cache with a category
    queryClient.setQueryData(queryKeys.entryCategories(ledgerId), [
      { id: "cat-1", name: "餐饮", description: "吃饭", entryCount: 0 },
    ]);
  });

  it("修改 category 后，乐观更新应立即生效", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useCategoryMutations(ledgerId, []),
      { wrapper }
    );

    // 触发更新
    act(() => {
      result.current.updateCategory.mutate({
        id: "cat-1",
        data: { description: "吃饭和饮料" },
      });
    });

    // 乐观更新应立即生效 - cache 已更新
    await waitFor(() => {
      const categories = queryClient.getQueryData<Record<string, unknown>[]>(queryKeys.entryCategories(ledgerId));
      expect(categories?.[0]?.description).toBe("吃饭和饮料");
    });

    // 验证：UI 从同一个 cache 读取，也会看到新值
    // 这就是修复后的行为 - 乐观更新立即反映
  });
});
