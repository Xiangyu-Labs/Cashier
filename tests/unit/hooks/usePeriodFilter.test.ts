import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePeriodFilter } from "@/features/ledger/client/hooks/usePeriodFilter";

describe("usePeriodFilter", () => {
  const mockPathname = "/ledger/test-id";
  let mockSearchParams: URLSearchParams;

  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    // Mock window.history.replaceState
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should initialize with provided initialPeriod", () => {
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams: mockSearchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    expect(result.current.periodParams.period).toBe("thisMonth");
    expect(result.current.dateRange.startDate).toBeDefined();
    expect(result.current.dateRange.endDate).toBeDefined();
  });

  it("should calculate correct date range for 'thisMonth' period", () => {
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams: mockSearchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    const now = new Date();
    const startDate = new Date(result.current.dateRange.startDate!);
    const endDate = new Date(result.current.dateRange.endDate!);

    // Should be current month
    expect(startDate.getMonth()).toBe(now.getMonth());
    expect(startDate.getDate()).toBe(1);
    expect(endDate.getMonth()).toBe(now.getMonth());
  });

  it("should calculate correct date range for 'week' period", () => {
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams: mockSearchParams,
        initialPeriod: { period: "week" },
      })
    );

    const now = new Date();
    const startDate = new Date(result.current.dateRange.startDate!);
    const endDate = new Date(result.current.dateRange.endDate!);

    // Should be 7 days ago to now
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    expect(diffDays).toBe(7);
    expect(endDate.getDate()).toBe(now.getDate());
  });

  it("should return null dates for 'all' period", () => {
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams: mockSearchParams,
        initialPeriod: { period: "all" },
      })
    );

    expect(result.current.dateRange.startDate).toBeNull();
    expect(result.current.dateRange.endDate).toBeNull();
  });

  it("should handle custom date range", () => {
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams: mockSearchParams,
        initialPeriod: {
          period: "custom",
          startDate: "2024-01-01",
          endDate: "2024-01-31",
        },
      })
    );

    const startDate = new Date(result.current.dateRange.startDate!);
    const endDate = new Date(result.current.dateRange.endDate!);

    expect(startDate.getFullYear()).toBe(2024);
    expect(startDate.getMonth()).toBe(0); // January
    expect(startDate.getDate()).toBe(1);

    expect(endDate.getFullYear()).toBe(2024);
    expect(endDate.getMonth()).toBe(0);
    expect(endDate.getDate()).toBe(31);
  });

  it("should update URL when period changes", () => {
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams: mockSearchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    act(() => {
      result.current.handlePeriodChange({ period: "week" });
    });

    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("period=week")
    );
  });

  it("should update URL with custom dates when custom period is selected", () => {
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams: mockSearchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    act(() => {
      result.current.handlePeriodChange({
        period: "custom",
        startDate: "2024-03-01",
        endDate: "2024-03-31",
      });
    });

    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("period=custom")
    );
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("startDate=2024-03-01")
    );
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("endDate=2024-03-31")
    );
  });

  it("should not update URL when skipUrlUpdate is true", () => {
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams: mockSearchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    act(() => {
      result.current.handlePeriodChange({ period: "week" }, { skipUrlUpdate: true });
    });

    expect(window.history.replaceState).not.toHaveBeenCalled();
  });

  it("should update period from filter changes with dates", () => {
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams: mockSearchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    act(() => {
      result.current.handleFiltersChange({
        startDate: new Date("2024-06-01"),
        endDate: new Date("2024-06-30"),
      });
    });

    expect(result.current.periodParams.period).toBe("custom");
    expect(result.current.periodParams.startDate).toBe("2024-06-01");
    expect(result.current.periodParams.endDate).toBe("2024-06-30");
  });

  it("should reset to currentPeriod when filter changes have no dates", () => {
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams: mockSearchParams,
        initialPeriod: { period: "custom", startDate: "2024-01-01", endDate: "2024-01-31" },
        monthStartDay: 15,
      })
    );

    act(() => {
      result.current.handleFiltersChange({});
    });

    expect(result.current.periodParams.period).toBe("currentPeriod");
  });

  it("should use monthStartDay for currentPeriod calculation", () => {
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams: mockSearchParams,
        initialPeriod: { period: "currentPeriod" },
        monthStartDay: 15,
      })
    );

    // The hook should use monthStartDay in the period params
    expect(result.current.periodParams.period).toBe("currentPeriod");
    expect(result.current.dateRange.startDate).toBeDefined();
    expect(result.current.dateRange.endDate).toBeDefined();
  });

  it("should memoize dateRange to prevent unnecessary recalculations", () => {
    const { result, rerender } = renderHook(
      ({ period }) =>
        usePeriodFilter({
          pathname: mockPathname,
          searchParams: mockSearchParams,
          initialPeriod: { period },
        }),
      { initialProps: { period: "thisMonth" as const } }
    );

    const firstDateRange = result.current.dateRange;

    // Re-render with same period
    rerender({ period: "thisMonth" });

    // Date range should be the same reference (memoized)
    expect(result.current.dateRange).toBe(firstDateRange);
  });

  it("should convert filters to Date objects", () => {
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams: mockSearchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    // Filters should be Date objects
    expect(result.current.filters.startDate).toBeInstanceOf(Date);
    expect(result.current.filters.endDate).toBeInstanceOf(Date);
  });

  describe("filterParams from URL", () => {
    it("should read categoryId from URL search params", () => {
      const searchParams = new URLSearchParams("categoryId=cat_123");
      const { result } = renderHook(() =>
        usePeriodFilter({
          pathname: mockPathname,
          searchParams,
          initialPeriod: { period: "thisMonth" },
        })
      );

      expect(result.current.filterParams.categoryId).toBe("cat_123");
      expect(result.current.filters.categoryId).toBe("cat_123");
    });

    it("should read currency from URL search params", () => {
      const searchParams = new URLSearchParams("currency=USD");
      const { result } = renderHook(() =>
        usePeriodFilter({
          pathname: mockPathname,
          searchParams,
          initialPeriod: { period: "thisMonth" },
        })
      );

      expect(result.current.filterParams.currency).toBe("USD");
      expect(result.current.filters.currency).toBe("USD");
    });

    it("should read minAmount and maxAmount from URL search params", () => {
      const searchParams = new URLSearchParams("minAmount=100&maxAmount=500");
      const { result } = renderHook(() =>
        usePeriodFilter({
          pathname: mockPathname,
          searchParams,
          initialPeriod: { period: "thisMonth" },
        })
      );

      expect(result.current.filterParams.minAmount).toBe(100);
      expect(result.current.filterParams.maxAmount).toBe(500);
      expect(result.current.filters.minAmount).toBe(100);
      expect(result.current.filters.maxAmount).toBe(500);
    });

    it("should return null for filter params not in URL", () => {
      const { result } = renderHook(() =>
        usePeriodFilter({
          pathname: mockPathname,
          searchParams: mockSearchParams,
          initialPeriod: { period: "thisMonth" },
        })
      );

      expect(result.current.filterParams.categoryId).toBeNull();
      expect(result.current.filterParams.currency).toBeNull();
      expect(result.current.filterParams.minAmount).toBeNull();
      expect(result.current.filterParams.maxAmount).toBeNull();
    });

    it("should preserve filter params when changing period", () => {
      const searchParams = new URLSearchParams("categoryId=cat_123&currency=CNY");
      const { result } = renderHook(() =>
        usePeriodFilter({
          pathname: mockPathname,
          searchParams,
          initialPeriod: { period: "thisMonth" },
        })
      );

      act(() => {
        result.current.handlePeriodChange({ period: "week" });
      });

      // Should preserve filter params in URL
      expect(window.history.replaceState).toHaveBeenCalledWith(
        null,
        "",
        expect.stringContaining("categoryId=cat_123")
      );
      expect(window.history.replaceState).toHaveBeenCalledWith(
        null,
        "",
        expect.stringContaining("currency=CNY")
      );
    });

    it("should update filter params when searchParams change", () => {
      const { result, rerender } = renderHook(
        ({ searchParams }) =>
          usePeriodFilter({
            pathname: mockPathname,
            searchParams,
            initialPeriod: { period: "thisMonth" },
          }),
        {
          initialProps: {
            searchParams: new URLSearchParams(),
          },
        }
      );

      expect(result.current.filterParams.categoryId).toBeNull();

      // Update search params
      rerender({ searchParams: new URLSearchParams("categoryId=new_cat") });

      expect(result.current.filterParams.categoryId).toBe("new_cat");
    });
  });

  it("should handle leap year in custom date range", () => {
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams: mockSearchParams,
        initialPeriod: {
          period: "custom",
          startDate: "2024-02-01",
          endDate: "2024-02-29", // 2024 is a leap year
        },
      })
    );

    const endDate = new Date(result.current.dateRange.endDate!);
    expect(endDate.getMonth()).toBe(1); // February
    expect(endDate.getDate()).toBe(29);
  });
});
