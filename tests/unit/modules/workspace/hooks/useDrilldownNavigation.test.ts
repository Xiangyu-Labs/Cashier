import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDrilldownNavigation } from "@/modules/workspace/hooks/useDrilldownNavigation";

// Mock next/router
const mockReplace = vi.fn();
vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

function getFirstReplaceCallUrl(): string {
  const firstCall = mockReplace.mock.calls[0];
  if (!firstCall) {
    throw new Error("Expected router.replace to be called");
  }
  const callUrl = firstCall[0];
  if (typeof callUrl !== "string") {
    throw new Error("Expected router.replace first argument to be a string URL");
  }
  return callUrl;
}

describe("useDrilldownNavigation", () => {
  const mockPathname = "/ledger/test-id";
  let mockSearchParams: URLSearchParams;

  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockReplace.mockClear();
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
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

  it("should encode uncategorized categoryId in URL", () => {
    const { result } = renderHook(() =>
      useDrilldownNavigation({
        pathname: mockPathname,
        searchParams: mockSearchParams,
      })
    );

    act(() => {
      result.current.handleCategoryDrilldown("__uncategorized__", "2024-01-01", "2024-01-31");
    });

    const callUrl = getFirstReplaceCallUrl();
    expect(callUrl).toContain("categoryId=__uncategorized__");
  });

  it("should keep uncategorized categoryId when date drilldown uses existing filter", () => {
    const paramsWithUncategorized = new URLSearchParams("categoryId=__uncategorized__");
    const { result } = renderHook(() =>
      useDrilldownNavigation({
        pathname: mockPathname,
        searchParams: paramsWithUncategorized,
      })
    );

    act(() => {
      result.current.handleDateDrilldown("2024-03-15");
    });

    const callUrl = getFirstReplaceCallUrl();
    expect(callUrl).toContain("categoryId=__uncategorized__");
    expect(callUrl).toContain("startDate=2024-03-15");
    expect(callUrl).toContain("endDate=2024-03-15");
  });

  it("should keep normal categoryId when date drilldown uses existing filter", () => {
    const paramsWithCategory = new URLSearchParams("categoryId=cat_123");
    const { result } = renderHook(() =>
      useDrilldownNavigation({
        pathname: mockPathname,
        searchParams: paramsWithCategory,
      })
    );

    act(() => {
      result.current.handleDateDrilldown("2024-03-15");
    });

    const callUrl = getFirstReplaceCallUrl();
    expect(callUrl).toContain("categoryId=cat_123");
    expect(callUrl).toContain("startDate=2024-03-15");
    expect(callUrl).toContain("endDate=2024-03-15");
  });

  it("should remove categoryId when filters explicitly clear it", () => {
    const paramsWithCategory = new URLSearchParams("categoryId=cat_123");
    const { result } = renderHook(() =>
      useDrilldownNavigation({
        pathname: mockPathname,
        searchParams: paramsWithCategory,
      })
    );

    act(() => {
      result.current.handleDateDrilldown("2024-03-15", { categoryId: null });
    });

    const callUrl = getFirstReplaceCallUrl();
    expect(callUrl).not.toContain("categoryId=cat_123");
    expect(callUrl).toContain("startDate=2024-03-15");
    expect(callUrl).toContain("endDate=2024-03-15");
  });

  it("should update browser URL before router navigation", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() =>
      useDrilldownNavigation({
        pathname: mockPathname,
        searchParams: mockSearchParams,
      })
    );

    act(() => {
      result.current.handleCategoryDrilldown("cat_123", "2024-01-01", "2024-01-31");
    });

    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/ledger/test-id?tab=details&period=custom&startDate=2024-01-01&endDate=2024-01-31&categoryId=cat_123"
    );
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

    const callUrl = getFirstReplaceCallUrl();
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

    const callUrl = getFirstReplaceCallUrl();
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

    const callUrl = getFirstReplaceCallUrl();
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

    const callUrl = getFirstReplaceCallUrl();
    expect(callUrl).toContain("categoryId=cat_123");
    expect(callUrl).not.toContain("currency=EUR");
  });
});
