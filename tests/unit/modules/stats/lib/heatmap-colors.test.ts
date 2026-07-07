import { describe, expect, it } from "vitest";
import {
  formatCellAmount,
  getHeatmapColor,
  getHeatmapLegend,
  getHeatmapLevel,
} from "@/modules/stats/lib/heatmap-colors";

describe("heatmap-colors", () => {
  it("returns level 0 for zero and negative amounts", () => {
    const stats = { minAmount: 0, maxAmount: 100, avgAmount: 50, p80Amount: 80 };
    expect(getHeatmapLevel(0, stats)).toBe(0);
    expect(getHeatmapLevel(-1, stats)).toBe(0);
  });

  it("maps amount to levels using effective max based on p80 and avg", () => {
    const stats = { minAmount: 0, maxAmount: 1000, avgAmount: 20, p80Amount: 10 };
    expect(getHeatmapLevel(3, stats)).toBe(1);
    expect(getHeatmapLevel(8, stats)).toBe(2);
    expect(getHeatmapLevel(15, stats)).toBe(3);
    expect(getHeatmapLevel(25, stats)).toBe(4);
    expect(getHeatmapLevel(40, stats)).toBe(5);
    expect(getHeatmapLevel(400, stats)).toBe(5);
  });

  it("returns safe fallback color for invalid level index", () => {
    expect(getHeatmapColor(99 as unknown as 0)).toBe("var(--heatmap-0)");
  });

  it("returns legend entries for all six levels", () => {
    const legend = getHeatmapLegend();

    expect(legend).toHaveLength(6);
    expect(legend[0]?.level).toBe(0);
    expect(legend[5]?.level).toBe(5);
  });

  it("formats amounts for cell display", () => {
    expect(formatCellAmount(999)).toBe("CNY 999");
    expect(formatCellAmount(1250, "USD", "en-US")).toBe("USD 1.3K");
    expect(formatCellAmount(12500, "USD", "en-US")).toBe("USD 12.5K");
    expect(formatCellAmount(10000, "USD", "en-US")).toBe("USD 10K");
    expect(formatCellAmount(15678, "USD", "en-US")).toBe("USD 15.7K");
  });
});
