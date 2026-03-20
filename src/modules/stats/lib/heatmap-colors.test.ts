import { describe, expect, it } from "vitest";
import {
  formatCellAmount,
  getHeatmapColor,
  getHeatmapLegend,
  getHeatmapLevel,
} from "./heatmap-colors";

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
    expect(getHeatmapColor(99 as unknown as 0, false)).toBe("#f7f7f8");
    expect(getHeatmapColor(99 as unknown as 0, true)).toBe("#202123");
  });

  it("returns legend entries for all six levels", () => {
    const light = getHeatmapLegend();
    const dark = getHeatmapLegend(true);

    expect(light).toHaveLength(6);
    expect(dark).toHaveLength(6);
    expect(light[0]?.level).toBe(0);
    expect(dark[5]?.level).toBe(5);
  });

  it("formats amounts for cell display", () => {
    expect(formatCellAmount(999)).toBe("¥999");
    expect(formatCellAmount(1250)).toBe("¥1.3k");
    expect(formatCellAmount(10000)).toBe("¥10k");
    expect(formatCellAmount(15678)).toBe("¥16k");
  });
});
