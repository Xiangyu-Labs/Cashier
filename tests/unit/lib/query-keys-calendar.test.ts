import { describe, it, expect } from "vitest";
import { queryKeys } from "@/lib/query-keys";

describe("calendar query keys", () => {
  const ledgerId = "ledger-123";
  it("应该匹配calendarHeatmap查询", () => {
    const key = queryKeys.calendarHeatmap(ledgerId, "month", "2024-03-01", undefined);
    expect(key).toEqual([
      "ledger",
      ledgerId,
      "calendar",
      "heatmap",
      "month",
      "2024-03-01",
      undefined,
    ]);
  });

  it("应该匹配calendarHeatmapForRange查询", () => {
    const key = queryKeys.calendarHeatmapForRange(ledgerId, "2024-01-01", "2024-12-31", undefined);
    expect(key).toEqual([
      "ledger",
      ledgerId,
      "calendar",
      "heatmap-range",
      "2024-01-01",
      "2024-12-31",
      undefined,
    ]);
  });

  it("应该匹配calendarDayDetail查询", () => {
    const key = queryKeys.calendarDayDetail(ledgerId, "2024-03-15", undefined);
    expect(key).toEqual(["ledger", ledgerId, "calendar", "day", "2024-03-15", undefined]);
  });

  it("所有 calendar key 共享 ledger 根", () => {
    const key = queryKeys.calendarHeatmap(ledgerId, "month", "2024-03-01", undefined);
    expect(key.slice(0, 2)).toEqual(queryKeys.ledger(ledgerId));
  });
});
