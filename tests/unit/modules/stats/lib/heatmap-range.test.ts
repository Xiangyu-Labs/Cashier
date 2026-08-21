import { describe, expect, it } from "vitest";
import { generateHeatmapDateKeys, resolveHeatmapRange } from "@/modules/stats/lib/heatmap-range";

describe("heatmap range", () => {
  it("generates a complete empty month from the query interval", () => {
    const range = resolveHeatmapRange([], {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });
    const dates = generateHeatmapDateKeys(range);
    expect(dates).toHaveLength(31);
    expect(dates[0]).toBe("2026-07-01");
    expect(dates.at(-1)).toBe("2026-07-31");
  });

  it("uses the full annual query interval rather than sparse data length", () => {
    const range = resolveHeatmapRange(
      [{ date: "2026-07-27", totalAmount: "10", entryCount: 1, currencies: ["CNY"] }],
      { startDate: "2026-01-01", endDate: "2026-12-31" }
    );
    expect(generateHeatmapDateKeys(range)).toHaveLength(365);
  });

  it("refuses to generate more than 3660 date keys", () => {
    expect(generateHeatmapDateKeys({ startDate: "2015-01-01", endDate: "2026-01-01" })).toEqual([]);
  });

  it("reuses date keys for the same range", () => {
    const range = { startDate: "2026-07-01", endDate: "2026-07-31" };
    expect(generateHeatmapDateKeys(range)).toBe(generateHeatmapDateKeys({ ...range }));
  });
});
