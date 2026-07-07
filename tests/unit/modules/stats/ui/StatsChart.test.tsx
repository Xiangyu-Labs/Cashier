import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatsChart } from "@/modules/stats/ui/StatsChart";

describe("StatsChart", () => {
  it("provides a visible-currency data table fallback for chart values", () => {
    render(
      <StatsChart
        data={[{ date: "2026-07-01", total: 12.5 }]}
        rangeType="week"
        startDate={new Date("2026-07-01T00:00:00.000Z")}
        endDate={new Date("2026-07-07T00:00:00.000Z")}
        currencySymbol="MYR"
      />
    );

    expect(screen.getByRole("table", { name: "图表数据" })).toBeTruthy();
    expect(screen.getByText("MYR 12.50")).toBeTruthy();
  });
});
