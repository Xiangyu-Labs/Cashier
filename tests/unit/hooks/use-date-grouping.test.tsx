import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDateGrouping } from "@/hooks/use-date-grouping";

describe("useDateGrouping", () => {
  it("keeps identical localized month/day labels from different years in separate groups", () => {
    const items = [
      { id: "new", date: "2026-03-01", amount: "2" },
      { id: "old", date: "2020-03-01", amount: "1" },
    ];
    const { result } = renderHook(() =>
      useDateGrouping({
        items,
        getDateStr: (item) => item.date,
        getAmount: (item) => item.amount,
        locale: "en-US",
        t: (key) => key,
      })
    );

    expect(result.current.groupedItems).toHaveLength(2);
    expect(result.current.groupedItems.map((group) => group.items[0]?.id)).toEqual(["new", "old"]);
    expect(result.current.groupedItems.map((group) => group.total)).toEqual(["2", "1"]);
  });

  it("adds grouped totals as decimal strings", () => {
    const { result } = renderHook(() =>
      useDateGrouping({
        items: [
          { id: "large", date: "2026-03-01", amount: "9007199254740993" },
          { id: "small", date: "2026-03-01", amount: "0.25" },
        ],
        getDateStr: (item) => item.date,
        getAmount: (item) => item.amount,
        locale: "en-US",
        t: (key) => key,
      })
    );

    expect(result.current.groupedItems[0]?.total).toBe("9007199254740993.25");
  });
});
