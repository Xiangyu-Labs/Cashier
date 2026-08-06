import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { StatsContentView } from "@/modules/stats/ui/StatsContentView";
import type { EnhancedStatsDto } from "@/modules/stats/contracts";

const baseProps = {
  rangeType: "month" as const,
  onRangeTypeChange: () => {},
  periodOffset: 0,
  onPeriodOffsetChange: () => {},
  label: "2026年8月",
  startDate: new Date(2026, 7, 1),
  endDate: new Date(2026, 7, 6),
  startDateStr: "2026-08-01",
  endDateStr: "2026-08-06",
  stats: undefined,
  chartView: "heatmap" as const,
  onChartViewChange: () => {},
  fallbackCurrency: "CNY",
};

const statsFixture: EnhancedStatsDto = {
  unconvertedCount: 0,
  summary: {
    total: "120",
    currency: "CNY",
    trend: { percent: 100, amount: "60" },
    dailyAverage: 20,
    comparison: {
      mode: "same_period",
      from: "2026-07-01",
      to: "2026-07-06",
      previousTotal: "60",
      amountDelta: "60",
      percent: 100,
    },
  },
  categories: [],
  chart: [],
  heatmap: {
    days: [],
    stats: { minAmount: 0, maxAmount: 0, avgAmount: 0, p80Amount: 0 },
  },
};

describe("StatsContentView", () => {
  it("shows an error panel instead of zero totals when the query failed without data", () => {
    render(<StatsContentView {...baseProps} isError onRetry={() => {}} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("统计数据加载失败，请重试。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(screen.queryByText("总支出")).not.toBeInTheDocument();
    expect(screen.queryByText(/0\.00/)).not.toBeInTheDocument();
  });

  it("keeps stale data and shows an inline warning when a refresh fails", () => {
    render(<StatsContentView {...baseProps} stats={statsFixture} isError />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("总支出")).toBeInTheDocument();
    expect(screen.getByText("¥120.00")).toBeInTheDocument();
  });

  it("calls onRetry when the retry button is clicked", () => {
    const onRetry = vi.fn();
    render(<StatsContentView {...baseProps} isError onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("marks the active chart view toggle with aria-pressed", () => {
    function Harness() {
      const [chartView, setChartView] = useState<"trend" | "heatmap">("heatmap");
      return (
        <StatsContentView
          {...baseProps}
          stats={statsFixture}
          chartView={chartView}
          onChartViewChange={setChartView}
        />
      );
    }
    render(<Harness />);

    const heatmapButton = screen.getByRole("button", { name: "热力" });
    const trendButton = screen.getByRole("button", { name: "趋势" });
    expect(heatmapButton).toHaveAttribute("aria-pressed", "true");
    expect(trendButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(trendButton);
    expect(trendButton).toHaveAttribute("aria-pressed", "true");
    expect(heatmapButton).toHaveAttribute("aria-pressed", "false");
  });
});
