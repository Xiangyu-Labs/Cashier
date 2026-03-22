import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CalendarDayData, CalendarHeatmapStats } from "@/types/calendar";

const largeGridSpy = vi.fn();
const smallGridSpy = vi.fn();

vi.mock("@/modules/stats/ui/AdaptiveHeatmap/LargeGrid", () => ({
  LargeGridHeatmap: (props: unknown) => {
    largeGridSpy(props);
    return <div data-testid="large-grid" />;
  },
}));

vi.mock("@/modules/stats/ui/AdaptiveHeatmap/SmallGrid", () => ({
  SmallGridHeatmap: (props: unknown) => {
    smallGridSpy(props);
    return <div data-testid="small-grid" />;
  },
}));

import { AdaptiveHeatmap } from "@/modules/stats/ui/AdaptiveHeatmap/index";

const stats: CalendarHeatmapStats = {
  minAmount: 0,
  maxAmount: 100,
  avgAmount: 50,
  p80Amount: 80,
};

function makeDays(count: number): CalendarDayData[] {
  return Array.from({ length: count }, (_, index) => ({
    date: `2024-03-${String(index + 1).padStart(2, "0")}`,
    totalAmount: 10,
    entryCount: 1,
    currencies: ["CNY"],
  }));
}

describe("AdaptiveHeatmap", () => {
  it("uses LargeGridHeatmap when day count is 35 or less", () => {
    const onDayClick = vi.fn();
    const queryRange = { startDate: "2024-03-01", endDate: "2024-03-31" };

    render(
      <AdaptiveHeatmap
        days={makeDays(35)}
        stats={stats}
        onDayClick={onDayClick}
        className="heatmap-wrap"
        queryRange={queryRange}
      />
    );

    expect(screen.getByTestId("large-grid")).toBeDefined();
    expect(smallGridSpy).not.toHaveBeenCalled();
    expect(largeGridSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        days: expect.any(Array),
        stats,
        onDayClick,
        className: "heatmap-wrap",
        queryRange,
      })
    );
  });

  it("uses SmallGridHeatmap when day count exceeds 35", () => {
    render(<AdaptiveHeatmap days={makeDays(36)} stats={stats} />);

    expect(screen.getByTestId("small-grid")).toBeDefined();
    expect(largeGridSpy).toHaveBeenCalledTimes(1);
    expect(smallGridSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        days: expect.any(Array),
        stats,
      })
    );
  });
});
