import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

    const trigger = screen.getByRole("button", { name: "2026-09-02, Expense: $12.5K" });
    fireEvent.focus(trigger);

    expect(await screen.findByText("Expense: $12.5K")).toBeVisible();
  });
});
