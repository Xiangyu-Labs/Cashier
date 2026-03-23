import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDetailsTabFilters } from "@/modules/workspace/ui";

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

describe("useDetailsTabFilters", () => {
  it("omits undefined advanced fields when relaying filter changes", () => {
    const onPeriodChange = vi.fn();
    const onAdvancedFiltersChange = vi.fn();

    const { result } = renderHook(() =>
      useDetailsTabFilters({
        periodParams: { period: "thisMonth" },
        advancedFilters: {},
      })
    );

    const handleFiltersChange = result.current.handleFiltersChange(
      onPeriodChange,
      onAdvancedFiltersChange
    );

    act(() => {
      handleFiltersChange({
        ...(result.current.filters.startDate != null
          ? { startDate: result.current.filters.startDate }
          : {}),
        ...(result.current.filters.endDate != null
          ? { endDate: result.current.filters.endDate }
          : {}),
      });
    });

    expect(onPeriodChange).not.toHaveBeenCalled();
    const advancedFiltersArg = onAdvancedFiltersChange.mock.calls[0]?.[0];
    expect(advancedFiltersArg).toBeDefined();
    expect(Object.keys(advancedFiltersArg)).toStrictEqual([]);
  });

  it("omits undefined date fields when emitting custom period updates", () => {
    const onPeriodChange = vi.fn();
    const onAdvancedFiltersChange = vi.fn();

    const { result } = renderHook(() =>
      useDetailsTabFilters({
        periodParams: {
          period: "custom",
          startDate: "2024-01-01",
          endDate: "2024-01-31",
        },
        advancedFilters: {},
      })
    );

    const handleFiltersChange = result.current.handleFiltersChange(
      onPeriodChange,
      onAdvancedFiltersChange
    );

    act(() => {
      handleFiltersChange({ startDate: new Date("2024-02-01") });
    });

    const periodArg = onPeriodChange.mock.calls[0]?.[0];
    expect(periodArg).toBeDefined();
    expect(periodArg).toStrictEqual({
      period: "custom",
      startDate: "2024-02-01",
    });
    expect("endDate" in periodArg).toBe(false);
  });
});
