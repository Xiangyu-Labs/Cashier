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

  it("formats localized compact amounts without currency markers", () => {
    const cnyResult = formatCellAmount(1500, "CNY", "zh-CN");
    expect(cnyResult).not.toMatch(/[¥￥$€£¤]|CNY|USD/);
    expect(cnyResult).toContain("1500");

    // CNY with zh-CN locale compact at larger values
    const cnyCompact = formatCellAmount(150000, "CNY", "zh-CN");
    expect(cnyCompact).not.toMatch(/[¥￥$€£¤]|CNY|USD/);
    expect(cnyCompact).toContain("15");

    // CNY with en-US locale uses K compact
    const cnyEnUs = formatCellAmount(12500, "CNY", "en-US");
    expect(cnyEnUs).not.toMatch(/[¥￥$€£¤]|CNY|USD/);
    expect(cnyEnUs).toContain("12.5");

    // USD with en-US produces $ compact symbol
    const usdResult = formatCellAmount(12500, "USD", "en-US");
    expect(usdResult).not.toMatch(/[¥￥$€£¤]|CNY|USD/);
    expect(usdResult).toContain("12.5");

    // Small amounts (not compact) still get currency symbol
    const smallUsd = formatCellAmount(500, "USD", "en-US");
    expect(smallUsd).not.toMatch(/[¥￥$€£¤]|CNY|USD/);
    expect(smallUsd).toContain("500");
  });

  it("ignores invalid currency codes", () => {
    const result = formatCellAmount(1000, "invalid", "en-US");
    expect(result).not.toMatch(/[¥￥$€£¤]|CNY|USD/);
    expect(result).toContain("1");
  });
});
