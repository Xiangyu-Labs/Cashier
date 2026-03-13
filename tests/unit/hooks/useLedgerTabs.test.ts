import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLedgerTabs } from "@/features/ledger/components/LedgerPageClient/useLedgerTabs";

// Mock window.history.replaceState
const mockReplaceState = vi.fn();
Object.defineProperty(window, 'history', {
  value: {
    replaceState: mockReplaceState,
  },
  writable: true,
});

describe("useLedgerTabs", () => {
  const mockPathname = "/ledger/test-id";

  beforeEach(() => {
    mockReplaceState.mockClear();
  });

  it("should initialize activeTab from URL search params", () => {
    const searchParams = new URLSearchParams("tab=stats");

    const { result } = renderHook(() =>
      useLedgerTabs({
        pathname: mockPathname,
        searchParams,
      })
    );

    expect(result.current.activeTab).toBe("stats");
  });

  it("should use initialTab when no tab in URL", () => {
    const searchParams = new URLSearchParams();

    const { result } = renderHook(() =>
      useLedgerTabs({
        pathname: mockPathname,
        searchParams,
        initialTab: "stream",
      })
    );

    expect(result.current.activeTab).toBe("stream");
  });

  it("should update URL when tab changes", () => {
    let searchParams = new URLSearchParams();

    const { result, rerender } = renderHook(() =>
      useLedgerTabs({
        pathname: mockPathname,
        searchParams,
      })
    );

    act(() => {
      result.current.handleTabChange("details");
    });

    // Verify URL was updated
    expect(mockReplaceState).toHaveBeenCalledWith(
      null,
      "",
      "/ledger/test-id?tab=details"
    );

    // Simulate URL change being reflected back to component (like Next.js router would do)
    searchParams = new URLSearchParams("tab=details");
    rerender({ pathname: mockPathname, searchParams });

    // Now activeTab should reflect the new URL
    expect(result.current.activeTab).toBe("details");
  });

  it("should preserve existing search params when changing tabs", () => {
    const searchParams = new URLSearchParams("categoryId=cat_123&period=month");

    const { result } = renderHook(() =>
      useLedgerTabs({
        pathname: mockPathname,
        searchParams,
      })
    );

    act(() => {
      result.current.handleTabChange("details");
    });

    const callUrl = mockReplaceState.mock.calls[0][2];
    expect(callUrl).toContain("tab=details");
    expect(callUrl).toContain("categoryId=cat_123");
    expect(callUrl).toContain("period=month");
  });

  it("should sync activeTab when URL search params change (drilldown scenario)", () => {
    // Initial render with stats tab
    let searchParams = new URLSearchParams("tab=stats");

    const { result, rerender } = renderHook(() =>
      useLedgerTabs({
        pathname: mockPathname,
        searchParams,
      })
    );

    expect(result.current.activeTab).toBe("stats");

    // Simulate URL change (e.g., from drilldown navigation)
    searchParams = new URLSearchParams("tab=details&categoryId=cat_123&period=custom");

    rerender({ pathname: mockPathname, searchParams });

    // This is the bug: activeTab should sync with URL but it doesn't
    expect(result.current.activeTab).toBe("details");
  });

  it("should sync activeTab when URL tab param is removed", () => {
    let searchParams = new URLSearchParams("tab=details");

    const { result, rerender } = renderHook(() =>
      useLedgerTabs({
        pathname: mockPathname,
        searchParams,
        initialTab: "stream",
      })
    );

    expect(result.current.activeTab).toBe("details");

    // Simulate URL change removing tab param
    searchParams = new URLSearchParams();

    rerender({ pathname: mockPathname, searchParams });

    // Should fall back to initialTab when tab param is removed
    expect(result.current.activeTab).toBe("stream");
  });
});
