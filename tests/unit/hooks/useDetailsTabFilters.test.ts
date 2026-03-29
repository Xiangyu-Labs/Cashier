import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDetailsTabFilters } from "@/modules/workspace/ui/useDetailsTabFilters";

describe("useDetailsTabFilters", () => {
  it("builds entry filters from period and advanced filters", () => {
    const { result } = renderHook(() =>
      useDetailsTabFilters({
        periodParams: {
          period: "custom",
          startDate: "2024-01-01",
          endDate: "2024-01-31",
        },
        advancedFilters: {
          categoryId: "cat-1",
          currency: "USD",
          minAmount: 20,
          maxAmount: 100,
        },
      })
    );

    expect(result.current.filters.categoryId).toBe("cat-1");
    expect(result.current.filters.currency).toBe("USD");
    expect(result.current.filters.minAmount).toBe(20);
    expect(result.current.filters.maxAmount).toBe(100);
    const startDate = result.current.filters.startDate;
    const endDate = result.current.filters.endDate;
    expect(startDate?.getFullYear()).toBe(2024);
    expect(startDate?.getMonth()).toBe(0);
    expect(startDate?.getDate()).toBe(1);
    expect(endDate?.getFullYear()).toBe(2024);
    expect(endDate?.getMonth()).toBe(0);
    expect(endDate?.getDate()).toBe(31);
  });

  it("builds a stable filter key from advanced filters only", () => {
    const { result } = renderHook(() =>
      useDetailsTabFilters({
        periodParams: { period: "thisMonth" },
        advancedFilters: {
          categoryId: "cat-1",
          minAmount: 20,
          maxAmount: 100,
        },
      })
    );

    expect(result.current.filterKey).toBe("cat:cat-1|min:20|max:100");
  });
});
