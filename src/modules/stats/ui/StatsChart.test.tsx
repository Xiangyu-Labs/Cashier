import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StatsChart } from "./StatsChart";

describe("StatsChart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-15T08:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders loading skeleton when isLoading is true", () => {
    const { container } = render(
      <StatsChart
        data={[{ date: "2024-03-01", total: 10 }]}
        rangeType="month"
        startDate={new Date("2024-03-01")}
        endDate={new Date("2024-03-31")}
        isLoading
      />
    );

    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders generated timeline when year range has no data points", () => {
    const { container } = render(
      <StatsChart
        data={[]}
        rangeType="year"
        startDate={new Date("2024-01-01")}
        endDate={new Date("2024-12-31")}
      />
    );

    const points = container.querySelectorAll("div.cursor-pointer");
    expect(points.length).toBeGreaterThan(0);
  });

  it("aggregates year range by month up to max(current month, latest data month)", () => {
    const { container } = render(
      <StatsChart
        data={[
          { date: "2024-01-10", total: 20 },
          { date: "2024-05-01", total: 30 },
        ]}
        rangeType="year"
        startDate={new Date("2024-01-01")}
        endDate={new Date("2024-12-31")}
      />
    );

    const points = container.querySelectorAll("div.cursor-pointer");
    expect(points.length).toBe(5);
  });

  it("caps daily points at today for month range when endDate is in the future", () => {
    const { container } = render(
      <StatsChart
        data={[{ date: "2024-03-01", total: 10 }]}
        rangeType="month"
        startDate={new Date("2024-03-01")}
        endDate={new Date("2024-03-31")}
      />
    );

    const points = container.querySelectorAll("div.cursor-pointer");
    expect(points.length).toBe(15);
  });

  it("shows adjusted scale badge and capped tooltip for outliers", () => {
    vi.setSystemTime(new Date("2024-04-05T08:00:00.000Z"));

    const data = Array.from({ length: 31 }, (_, index) => ({
      date: `2024-03-${String(index + 1).padStart(2, "0")}`,
      total: index === 30 ? 1000 : 10,
    }));

    const { container } = render(
      <StatsChart
        data={data}
        rangeType="month"
        startDate={new Date("2024-03-01")}
        endDate={new Date("2024-03-31")}
      />
    );

    expect(screen.getByText(/已调整显示比例|scaleAdjusted/)).toBeDefined();

    const points = container.querySelectorAll("div.cursor-pointer");
    const lastPoint = points[points.length - 1];
    if (lastPoint == null) {
      throw new Error("Expected last data point");
    }
    fireEvent.click(lastPoint);

    expect(screen.getByText(/超出显示上限|exceedsLimit/)).toBeDefined();
  });
});
