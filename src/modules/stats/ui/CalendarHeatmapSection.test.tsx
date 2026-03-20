import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CalendarDayData, CalendarHeatmapStats } from "@/types/calendar";

const adaptiveHeatmapSpy = vi.fn();

vi.mock("./AdaptiveHeatmap", () => ({
  AdaptiveHeatmap: (props: {
    onDayClick?: (date: string) => void;
    queryRange?: { startDate: string; endDate: string };
  }) => {
    adaptiveHeatmapSpy(props);
    return (
      <button data-testid="heatmap-grid" onClick={() => props.onDayClick?.("2024-03-12")}>
        grid
      </button>
    );
  },
}));

vi.mock("../lib/heatmap-colors", () => ({
  getHeatmapLegend: () => [
    { level: 0, color: "#000000", label: "none" },
    { level: 1, color: "#111111", label: "low" },
    { level: 2, color: "#222222", label: "mid" },
    { level: 3, color: "#333333", label: "high" },
    { level: 4, color: "#444444", label: "higher" },
    { level: 5, color: "#555555", label: "max" },
  ],
}));

import { CalendarHeatmapSection } from "./CalendarHeatmapSection";

const stats: CalendarHeatmapStats = {
  minAmount: 0,
  maxAmount: 100,
  avgAmount: 50,
  p80Amount: 80,
};

const days: CalendarDayData[] = [
  {
    date: "2024-03-12",
    totalAmount: 30,
    entryCount: 1,
    currencies: ["CNY"],
  },
];

describe("CalendarHeatmapSection", () => {
  it("renders no-data state when days is empty", () => {
    render(<CalendarHeatmapSection days={[]} stats={stats} />);

    expect(screen.getByText("暂无数据")).toBeDefined();
  });

  it("renders adaptive heatmap and legend labels", () => {
    render(<CalendarHeatmapSection days={days} stats={stats} />);

    expect(screen.getByTestId("heatmap-grid")).toBeDefined();
    expect(screen.getByText("少")).toBeDefined();
    expect(screen.getByText("多")).toBeDefined();
    expect(screen.getAllByTitle(/none|low|mid|high|higher|max/)).toHaveLength(6);
  });

  it("forwards queryRange and triggers date drilldown", () => {
    const onDateDrilldown = vi.fn();
    const queryRange = { startDate: "2024-03-01", endDate: "2024-03-31" };

    render(
      <CalendarHeatmapSection
        days={days}
        stats={stats}
        onDateDrilldown={onDateDrilldown}
        queryRange={queryRange}
      />
    );

    expect(adaptiveHeatmapSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryRange,
      })
    );

    fireEvent.click(screen.getByTestId("heatmap-grid"));
    expect(onDateDrilldown).toHaveBeenCalledWith("2024-03-12");
  });
});
