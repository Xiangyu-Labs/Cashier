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
  getEntryCategoriesAction: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/ledger/server/actions/settings", () => ({
  getLedgerSettingsAction: vi.fn().mockResolvedValue({
    uncategorizedCount: 0,
    credentials: [],
  }),
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

    // Initialize only the entryCategories cache
    // After the fix, useLedgerSettings reads from entryCategories key directly
    queryClient.setQueryData(queryKeys.entryCategories(ledgerId), [
      { id: "cat-1", name: "餐饮", description: "吃饭", entryCount: 0 },
    ]);

    // ledgerSettings no longer contains categories
    queryClient.setQueryData(queryKeys.ledgerSettings(ledgerId), {
      uncategorizedCount: 0,
      credentials: [],
    });
  });

  it("修改 category 后，entryCategories 应该立即更新（乐观更新）", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useCategoryMutations(ledgerId, []),
      { wrapper }
    );

    // Trigger update
    act(() => {
      result.current.updateCategory.mutate({
        id: "cat-1",
        data: { description: "吃饭和饮料" },
      });
    });

    // Verify entryCategories is updated immediately (optimistic update)
    await waitFor(() => {
      const entryCats = queryClient.getQueryData<Record<string, unknown>[]>(queryKeys.entryCategories(ledgerId));
      expect(entryCats?.[0]?.description).toBe("吃饭和饮料");
    });

    // After the fix, useLedgerSettings reads from entryCategories key
    // So the UI will see the updated value immediately
  });
});
