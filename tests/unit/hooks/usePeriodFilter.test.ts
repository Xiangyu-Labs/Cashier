import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePeriodFilter } from "@/features/ledger/client/hooks/use-period-filter";
import { formatDateTimeForApi } from "@/lib/date-utils";

describe("usePeriodFilter", () => {
  const mockPathname = "/ledger/test-id";

  beforeEach(() => {
    // Mock window.history.replaceState
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should derive period from URL search params", () => {
    const searchParams = new URLSearchParams("period=thisMonth");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
        initialPeriod: { period: "week" }, // Should be ignored
      })
    );

    expect(result.current.periodParams.period).toBe("thisMonth");
    expect(result.current.dateRange.startDate).toBeDefined();
    expect(result.current.dateRange.endDate).toBeDefined();
  });

  it("should calculate correct date range for 'thisMonth' period", () => {
    const searchParams = new URLSearchParams("period=thisMonth");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
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
    const searchParams = new URLSearchParams("period=week");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
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
    const searchParams = new URLSearchParams("period=all");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
        initialPeriod: { period: "all" },
      })
    );

    expect(result.current.dateRange.startDate).toBeNull();
    expect(result.current.dateRange.endDate).toBeNull();
  });

  it("should handle custom date range from URL", () => {
    const searchParams = new URLSearchParams(
      "period=custom&startDate=2024-01-01&endDate=2024-01-31"
    );
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    expect(result.current.periodParams.period).toBe("custom");
    expect(result.current.periodParams.startDate).toBe("2024-01-01");
    expect(result.current.periodParams.endDate).toBe("2024-01-31");

    const startDate = new Date(result.current.dateRange.startDate!);
    const endDate = new Date(result.current.dateRange.endDate!);

    expect(startDate.getFullYear()).toBe(2024);
    expect(startDate.getMonth()).toBe(0); // January
    expect(startDate.getDate()).toBe(1);

    expect(endDate.getFullYear()).toBe(2024);
    expect(endDate.getMonth()).toBe(0);
    expect(endDate.getDate()).toBe(31);
  });

  it("should default to thisMonth when no period in URL", () => {
    const searchParams = new URLSearchParams();
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    expect(result.current.periodParams.period).toBe("thisMonth");
  });

  it("should update URL when period changes", () => {
    const searchParams = new URLSearchParams("period=thisMonth");
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

    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("period=week")
    );
  });

  it("should update URL with custom dates when custom period is selected", () => {
    const searchParams = new URLSearchParams("period=thisMonth");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
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

  it("should clear custom dates when switching back to a preset period", () => {
    const searchParams = new URLSearchParams("period=custom&startDate=2024-03-01&endDate=2024-03-31");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
        initialPeriod: { period: "custom", startDate: "2024-03-01", endDate: "2024-03-31" },
      })
    );

    act(() => {
      result.current.handlePeriodChange({ period: "month" });
    });

    const callUrl = vi.mocked(window.history.replaceState).mock.calls[0][2] as string;
    expect(callUrl).toContain("period=month");
    expect(callUrl).not.toContain("startDate=");
    expect(callUrl).not.toContain("endDate=");
  });

  it("should not update URL when skipUrlUpdate is true", () => {
    const searchParams = new URLSearchParams("period=thisMonth");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    act(() => {
      result.current.handlePeriodChange({ period: "week" }, { skipUrlUpdate: true });
    });

    expect(window.history.replaceState).not.toHaveBeenCalled();
  });

  it("should update URL from filter changes with dates", () => {
    const searchParams = new URLSearchParams("period=thisMonth");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    act(() => {
      result.current.handleFiltersChange({
        startDate: new Date("2024-06-01"),
        endDate: new Date("2024-06-30"),
      });
    });

    // Should update URL with custom dates
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("period=custom")
    );
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("startDate=2024-06-01")
    );
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("endDate=2024-06-30")
    );
  });

  it("should update URL when only amount filters change", () => {
    const searchParams = new URLSearchParams("period=thisMonth");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    act(() => {
      result.current.handleFiltersChange({
        startDate: result.current.filters.startDate,
        endDate: result.current.filters.endDate,
        minAmount: 100,
        maxAmount: 500,
      });
    });

    const callUrl = vi.mocked(window.history.replaceState).mock.calls[0][2] as string;
    expect(callUrl).toContain("period=custom");
    expect(callUrl).toContain("minAmount=100");
    expect(callUrl).toContain("maxAmount=500");
  });

  it("should remove amount params from URL when cleared", () => {
    const searchParams = new URLSearchParams("period=thisMonth&minAmount=100&maxAmount=500");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    act(() => {
      result.current.handleFiltersChange({
        startDate: result.current.filters.startDate,
        endDate: result.current.filters.endDate,
        minAmount: null,
        maxAmount: null,
      });
    });

    const callUrl = vi.mocked(window.history.replaceState).mock.calls[0][2] as string;
    expect(callUrl).not.toContain("minAmount=");
    expect(callUrl).not.toContain("maxAmount=");
  });

  it("should update URL with both custom dates and amount filters", () => {
    const searchParams = new URLSearchParams("period=thisMonth");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    act(() => {
      result.current.handleFiltersChange({
        startDate: new Date("2024-06-01"),
        endDate: new Date("2024-06-30"),
        minAmount: 88,
        maxAmount: 188,
      });
    });

    const callUrl = vi.mocked(window.history.replaceState).mock.calls[0][2] as string;
    expect(callUrl).toContain("period=custom");
    expect(callUrl).toContain("startDate=2024-06-01");
    expect(callUrl).toContain("endDate=2024-06-30");
    expect(callUrl).toContain("minAmount=88");
    expect(callUrl).toContain("maxAmount=188");
  });

  it("should reset to thisMonth URL when filter changes have no dates", () => {
    const searchParams = new URLSearchParams(
      "period=custom&startDate=2024-01-01&endDate=2024-01-31"
    );
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
        initialPeriod: { period: "custom", startDate: "2024-01-01", endDate: "2024-01-31" },
      })
    );

    act(() => {
      result.current.handleFiltersChange({});
    });

    // Should update URL to thisMonth
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("period=thisMonth")
    );
  });

  it("should calculate thisMonth period correctly", () => {
    const searchParams = new URLSearchParams("period=thisMonth");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    expect(result.current.periodParams.period).toBe("thisMonth");
    expect(result.current.dateRange.startDate).toBeDefined();
    expect(result.current.dateRange.endDate).toBeDefined();
  });

  it("should memoize dateRange to prevent unnecessary recalculations", () => {
    const searchParams = new URLSearchParams("period=thisMonth");
    const { result, rerender } = renderHook(
      ({ sp }) =>
        usePeriodFilter({
          pathname: mockPathname,
          searchParams: sp,
          initialPeriod: { period: "thisMonth" },
        }),
      { initialProps: { sp: searchParams } }
    );

    const firstDateRange = result.current.dateRange;

    // Re-render with same search params
    rerender({ sp: searchParams });

    // Date range should be the same reference (memoized)
    expect(result.current.dateRange).toBe(firstDateRange);
  });

  it("should convert filters to Date objects", () => {
    const searchParams = new URLSearchParams("period=thisMonth");
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    // Filters should be Date objects
    expect(result.current.filters.startDate).toBeInstanceOf(Date);
    expect(result.current.filters.endDate).toBeInstanceOf(Date);
  });

  it("should preserve custom period boundaries when converting filters to Date objects", () => {
    const searchParams = new URLSearchParams(
      "period=custom&startDate=2024-03-01&endDate=2024-03-31"
    );
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    expect(formatDateTimeForApi(result.current.filters.startDate)).toBe("2024-03-01");
    expect(formatDateTimeForApi(result.current.filters.endDate)).toBe("2024-03-31");
  });

  describe("filterParams from URL", () => {
    it("should read categoryId from URL search params", () => {
      const searchParams = new URLSearchParams("period=thisMonth&categoryId=cat_123");
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
      const searchParams = new URLSearchParams("period=thisMonth&currency=USD");
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
      const searchParams = new URLSearchParams("period=thisMonth&minAmount=100&maxAmount=500");
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
      const searchParams = new URLSearchParams("period=thisMonth");
      const { result } = renderHook(() =>
        usePeriodFilter({
          pathname: mockPathname,
          searchParams,
          initialPeriod: { period: "thisMonth" },
        })
      );

      expect(result.current.filterParams.categoryId).toBeNull();
      expect(result.current.filterParams.currency).toBeNull();
      expect(result.current.filterParams.minAmount).toBeNull();
      expect(result.current.filterParams.maxAmount).toBeNull();
    });

    it("should preserve filter params when changing period", () => {
      const searchParams = new URLSearchParams("period=thisMonth&categoryId=cat_123&currency=CNY");
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
            searchParams: new URLSearchParams("period=thisMonth"),
          },
        }
      );

      expect(result.current.filterParams.categoryId).toBeNull();

      // Update search params
      rerender({ searchParams: new URLSearchParams("period=thisMonth&categoryId=new_cat") });

      expect(result.current.filterParams.categoryId).toBe("new_cat");
    });
  });

  it("should handle leap year in custom date range", () => {
    const searchParams = new URLSearchParams(
      "period=custom&startDate=2024-02-01&endDate=2024-02-29"
    );
    const { result } = renderHook(() =>
      usePeriodFilter({
        pathname: mockPathname,
        searchParams,
        initialPeriod: { period: "thisMonth" },
      })
    );

    expect(result.current.periodParams.startDate).toBe("2024-02-01");
    expect(result.current.periodParams.endDate).toBe("2024-02-29");

    const endDate = new Date(result.current.dateRange.endDate!);
    expect(endDate.getMonth()).toBe(1); // February
    expect(endDate.getDate()).toBe(29);
  });

  describe("URL-driven state updates", () => {
    it("should update periodParams when URL period changes", () => {
      const { result, rerender } = renderHook(
        ({ searchParams }) =>
          usePeriodFilter({
            pathname: mockPathname,
            searchParams,
            initialPeriod: { period: "thisMonth" },
          }),
        {
          initialProps: {
            searchParams: new URLSearchParams("period=thisMonth"),
          },
        }
      );

      expect(result.current.periodParams.period).toBe("thisMonth");

      // Simulate URL change
      rerender({
        searchParams: new URLSearchParams("period=custom&startDate=2024-03-01&endDate=2024-03-31"),
      });

      expect(result.current.periodParams.period).toBe("custom");
      expect(result.current.periodParams.startDate).toBe("2024-03-01");
      expect(result.current.periodParams.endDate).toBe("2024-03-31");
    });

    it("should respond to tab switch with custom dates (drilldown scenario)", () => {
      // Initial state: thisMonth
      const { result, rerender } = renderHook(
        ({ searchParams }) =>
          usePeriodFilter({
            pathname: mockPathname,
            searchParams,
            initialPeriod: { period: "thisMonth" },
          }),
        {
          initialProps: {
            searchParams: new URLSearchParams("period=thisMonth"),
          },
        }
      );

      const initialStartDate = result.current.dateRange.startDate;

      // Simulate drilldown navigation: URL changes to custom period
      rerender({
        searchParams: new URLSearchParams(
          "tab=details&period=custom&startDate=2024-01-01&endDate=2024-01-31&categoryId=food"
        ),
      });

      // Should immediately reflect new URL state
      expect(result.current.periodParams.period).toBe("custom");
      expect(result.current.periodParams.startDate).toBe("2024-01-01");
      expect(result.current.periodParams.endDate).toBe("2024-01-31");
      expect(result.current.filterParams.categoryId).toBe("food");
      expect(result.current.dateRange.startDate).not.toBe(initialStartDate);
    });
  });
});
