import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StatsHeader } from "./StatsHeader";

const addPeriodMock = vi.fn((date: Date, _type: string, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
});

const getDateRangeMock = vi.fn(() => ({
  startDate: new Date("2024-03-16T00:00:00.000Z"),
  endDate: new Date("2024-03-22T00:00:00.000Z"),
}));

vi.mock("@/lib/date-utils", async () => {
  const actual = await vi.importActual("@/lib/date-utils");
  return {
    ...actual,
    addPeriod: (date: Date, type: string, amount: number) => addPeriodMock(date, type, amount),
    getDateRange: (date: Date, type: string) => getDateRangeMock(date, type),
  };
});

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("StatsHeader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-15T00:00:00.000Z"));
    vi.clearAllMocks();
  });

  it("switches range and resets current date to now", () => {
    const setRangeType = vi.fn();
    const setCurrentDate = vi.fn();

    render(
      <StatsHeader
        rangeType="month"
        setRangeType={setRangeType}
        currentDate={new Date("2024-03-01")}
        setCurrentDate={setCurrentDate}
        label="2024-03"
        totalExpense={100}
        averageDaily={10}
      />
    );

    fireEvent.click(screen.getByText("week"));

    expect(setRangeType).toHaveBeenCalledWith("week");
    expect(setCurrentDate).toHaveBeenCalledWith(expect.any(Date));
  });

  it("navigates to previous and next period using addPeriod", () => {
    getDateRangeMock.mockReturnValue({
      startDate: new Date("2024-03-14T00:00:00.000Z"),
      endDate: new Date("2024-03-20T00:00:00.000Z"),
    });

    const setCurrentDate = vi.fn();
    const currentDate = new Date("2024-03-10T00:00:00.000Z");

    render(
      <StatsHeader
        rangeType="week"
        setRangeType={vi.fn()}
        currentDate={currentDate}
        setCurrentDate={setCurrentDate}
        label="week label"
        totalExpense={200}
        averageDaily={30}
      />
    );

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[3] ?? buttons[0]); // left chevron
    fireEvent.click(buttons[4] ?? buttons[1]); // right chevron

    expect(addPeriodMock).toHaveBeenCalledWith(currentDate, "week", -1);
    expect(addPeriodMock).toHaveBeenCalledWith(currentDate, "week", 1);
    expect(setCurrentDate).toHaveBeenCalledTimes(2);
  });

  it("disables next button when next period starts after today", () => {
    getDateRangeMock.mockReturnValue({
      startDate: new Date("2024-03-16T00:00:00.000Z"),
      endDate: new Date("2024-03-22T00:00:00.000Z"),
    });

    render(
      <StatsHeader
        rangeType="month"
        setRangeType={vi.fn()}
        currentDate={new Date("2024-03-10")}
        setCurrentDate={vi.fn()}
        label="month label"
        totalExpense={300}
        averageDaily={20}
      />
    );

    const buttons = screen.getAllByRole("button");
    const nextButton = buttons[4] ?? buttons[1];
    expect(nextButton?.hasAttribute("disabled")).toBe(true);
  });

  it("renders trend text with sign and previous period label", () => {
    render(
      <StatsHeader
        rangeType="month"
        setRangeType={vi.fn()}
        currentDate={new Date("2024-03-10")}
        setCurrentDate={vi.fn()}
        label="month label"
        totalExpense={300}
        averageDaily={20}
        trend={{ percent: 12.345, amount: 50 }}
      />
    );

    expect(screen.getByText(/\+12.3% vsPreviousPeriod/)).toBeDefined();
  });
});
