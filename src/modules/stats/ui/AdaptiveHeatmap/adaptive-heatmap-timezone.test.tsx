import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LargeGridHeatmap } from "./LargeGrid";
import { SmallGridHeatmap } from "./SmallGrid";
import type { CalendarDayData, CalendarHeatmapStats } from "@/types/calendar";

vi.mock("@/modules/stats/ui/AdaptiveHeatmap/DayCellLarge", () => ({
  DayCellLarge: ({ date }: { date: string }) => <div data-testid="large-day">{date}</div>,
}));

vi.mock("@/modules/stats/ui/AdaptiveHeatmap/DayCellSmall", () => ({
  DayCellSmall: ({ date }: { date: string }) => <div data-testid="small-day">{date}</div>,
}));

const stats: CalendarHeatmapStats = {
  minAmount: 0,
  maxAmount: 100,
  avgAmount: 50,
  p80Amount: 80,
};

const baseDay = (date: string): CalendarDayData => ({
  date,
  totalAmount: 100,
  entryCount: 1,
  currencies: ["CNY"],
});

const RealDate = Date;

function installDateOnlyShiftMock() {
  class MockDate extends RealDate {
    constructor(...args: ConstructorParameters<DateConstructor>) {
      if (args.length === 1 && typeof args[0] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
        const [year, month, day] = args[0].split("-").map(Number);
        if (year == null || month == null || day == null) {
          throw new Error("Expected date parts");
        }
        super(RealDate.UTC(year, month - 1, day, -8, 0, 0, 0));
        return;
      }

      super(...args);
    }

    static now() {
      return RealDate.now();
    }

    static parse(dateString: string) {
      return RealDate.parse(dateString);
    }

    static UTC(...args: Parameters<typeof Date.UTC>) {
      return RealDate.UTC(...args);
    }
  }

  vi.stubGlobal("Date", MockDate as unknown as DateConstructor);
}

function buildRangeDays(start: { year: number; month: number; day: number }, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const current = new RealDate(start.year, start.month - 1, start.day + index);
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    const day = String(current.getDate()).padStart(2, "0");
    return baseDay(`${year}-${month}-${day}`);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Adaptive heatmap timezone-safe parsing", () => {
  it("keeps the query end date in LargeGridHeatmap when date-only strings would shift backward", () => {
    installDateOnlyShiftMock();

    render(
      <LargeGridHeatmap
        days={[baseDay("2026-03-18")]}
        stats={stats}
        queryRange={{ startDate: "2026-03-18", endDate: "2026-03-18" }}
      />
    );

    const renderedDates = screen.getAllByTestId("large-day").map((node) => node.textContent);
    expect(renderedDates).toEqual(["2026-03-18"]);
  });

  it("includes the query end date in SmallGridHeatmap", () => {
    render(
      <SmallGridHeatmap
        days={buildRangeDays({ year: 2026, month: 3, day: 1 }, 36)}
        stats={stats}
        queryRange={{ startDate: "2026-03-01", endDate: "2026-03-18" }}
      />
    );

    const renderedDates = screen.getAllByTestId("small-day").map((node) => node.textContent);
    expect(renderedDates).toContain("2026-03-18");
  });
});
