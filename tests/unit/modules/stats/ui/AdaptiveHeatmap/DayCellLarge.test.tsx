import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DayCellLarge } from "@/modules/stats/ui/AdaptiveHeatmap/DayCellLarge";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    if (key === "expense") return "Expense";
    if (key === "noConsumption") return "No consumption";
    return key;
  },
}));

describe("DayCellLarge", () => {
  // The cell names its day, so it reads the clock to spot today/yesterday.
  // Pin it well past the fixtures, which then always render in full.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-11T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens its currency tooltip for keyboard focus", async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <DayCellLarge
          date="2026-09-02"
          dayNumber={2}
          amount="12500"
          level={3}
          currency="USD"
          locale="en-US"
        />
      </TooltipProvider>
    );

    const trigger = screen.getByRole("button", {
      name: "Wednesday, September 2, 2026, Expense: $12.5K",
    });
    fireEvent.focus(trigger);

    expect(await screen.findByText("Expense: $12.5K")).toBeVisible();
  });

  it("shows a zero net amount when the day contains offsetting entries", () => {
    render(
      <TooltipProvider delayDuration={0}>
        <DayCellLarge
          date="2026-09-03"
          dayNumber={3}
          amount="0"
          count={2}
          level={0}
          currency="USD"
          locale="en-US"
        />
      </TooltipProvider>
    );

    expect(
      screen.getByRole("button", {
        name: "Thursday, September 3, 2026, Expense: $0",
      })
    ).toBeVisible();
  });
});
