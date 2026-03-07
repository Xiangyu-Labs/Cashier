import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDrilldownNavigation } from "@/features/ledger/components/LedgerPageClient/useDrilldownNavigation";

// Mock next/router
const mockReplace = vi.fn();
vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

describe("useDrilldownNavigation", () => {
  const mockPathname = "/ledger/test-id";
  let mockSearchParams: URLSearchParams;

  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockReplace.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should navigate to details tab with categoryId", () => {
    const { result } = renderHook(() =>
      useDrilldownNavigation({
        pathname: mockPathname,
        searchParams: mockSearchParams,
      })
    );

    act(() => {
      result.current.handleCategoryDrilldown("cat_123", "2024-01-01", "2024-01-31");
    });

    expect(mockReplace).toHaveBeenCalledWith(
      "/ledger/test-id?tab=details&period=custom&startDate=2024-01-01&endDate=2024-01-31&categoryId=cat_123",
      { scroll: false }
    );
  });

  it("should not include uncategorized categoryId in URL", () => {
    const { result } = renderHook(() =>
      useDrilldownNavigation({
        pathname: mockPathname,
        searchParams: mockSearchParams,
      })
    );

    act(() => {
      result.current.handleCategoryDrilldown("__uncategorized__", "2024-01-01", "2024-01-31");
    });

    const callUrl = mockReplace.mock.calls[0][0];
    expect(callUrl).not.toContain("categoryId");
  });

  it("should preserve existing search params", () => {
    const existingParams = new URLSearchParams("existingParam=value");
    const { result } = renderHook(() =>
      useDrilldownNavigation({
        pathname: mockPathname,
        searchParams: existingParams,
      })
    );

    act(() => {
      result.current.handleCategoryDrilldown("cat_123", "2024-01-01", "2024-01-31");
    });

    const callUrl = mockReplace.mock.calls[0][0];
    expect(callUrl).toContain("existingParam=value");
    expect(callUrl).toContain("tab=details");
    expect(callUrl).toContain("categoryId=cat_123");
  });

  it("should handle date drilldown with filters", () => {
    const { result } = renderHook(() =>
      useDrilldownNavigation({
        pathname: mockPathname,
        searchParams: mockSearchParams,
      })
    );

    act(() => {
      result.current.handleDateDrilldown("2024-03-15", {
        categoryId: "cat_456",
        currency: "USD",
      });
    });

    const callUrl = mockReplace.mock.calls[0][0];
    expect(callUrl).toContain("tab=details");
    expect(callUrl).toContain("period=custom");
    expect(callUrl).toContain("startDate=2024-03-15");
    expect(callUrl).toContain("endDate=2024-03-15");
    expect(callUrl).toContain("categoryId=cat_456");
    expect(callUrl).toContain("currency=USD");
  });

  it("should handle date drilldown without filters", () => {
    const { result } = renderHook(() =>
      useDrilldownNavigation({
        pathname: mockPathname,
        searchParams: mockSearchParams,
      })
    );

    act(() => {
      result.current.handleDateDrilldown("2024-03-15");
    });

    const callUrl = mockReplace.mock.calls[0][0];
    expect(callUrl).toContain("tab=details");
    expect(callUrl).toContain("startDate=2024-03-15");
    expect(callUrl).not.toContain("categoryId");
    expect(callUrl).not.toContain("currency");
  });

  it("should remove currency from URL when not provided", () => {
    const existingParams = new URLSearchParams("currency=EUR");
    const { result } = renderHook(() =>
      useDrilldownNavigation({
        pathname: mockPathname,
        searchParams: existingParams,
      })
    );

    act(() => {
      result.current.handleDateDrilldown("2024-03-15", { categoryId: "cat_123" });
    });

    const callUrl = mockReplace.mock.calls[0][0];
    expect(callUrl).toContain("categoryId=cat_123");
    expect(callUrl).not.toContain("currency=EUR");
  });
});
