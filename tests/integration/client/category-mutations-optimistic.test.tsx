import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { useCategoryMutations } from "@/features/ledger/client/hooks/useCategoryMutations";
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
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("类型 A: Entity 级别的 key 分裂", () => {
  let queryClient: QueryClient;
  const ledgerId = "ledger-test-123";

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // 初始化两个不同的 cache
    queryClient.setQueryData(queryKeys.entryCategories(ledgerId), [
      { id: "cat-1", name: "餐饮", description: "吃饭", entryCount: 0 },
    ]);

    queryClient.setQueryData(queryKeys.ledgerSettings(ledgerId), {
      categories: [{ id: "cat-1", name: "餐饮", description: "吃饭" }],
      uncategorizedCount: 0,
      credentials: [],
    });
  });

  it("修改 category 后，entryCategories 和 ledgerSettings 应该同时更新", async () => {
    // 问题：乐观更新只修改 entryCategories
    // UI 从 ledgerSettings 读取，看到的是旧值

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

    // 检查 entryCategories 已更新（乐观更新生效）
    await waitFor(() => {
      const entryCats = queryClient.getQueryData<Record<string, unknown>[]>(queryKeys.entryCategories(ledgerId));
      expect(entryCats?.[0]?.description).toBe("吃饭和饮料");
    });

    // 问题：ledgerSettings 还是旧值！
    const settings = queryClient.getQueryData<{ categories: Record<string, unknown>[] }>(queryKeys.ledgerSettings(ledgerId));
    expect(settings?.categories[0]?.description).toBe("吃饭"); // 仍然是旧值！

    // 期望（修复后）：两个 cache 都更新
    // expect(settings.categories[0].description).toBe("吃饭和饮料");
  });
});
