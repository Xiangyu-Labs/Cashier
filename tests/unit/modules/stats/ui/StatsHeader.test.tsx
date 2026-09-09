import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatsHeader } from "@/modules/stats/ui/StatsHeader";

const baseProps = {
  rangeType: "month" as const,
  setRangeType: vi.fn(),
  periodOffset: 0,
  setPeriodOffset: vi.fn(),
  label: "2026年8月",
  totalExpense: "0",
  averageDaily: "0",
  currencySymbol: "CNY",
  periodLabel: "上月",
};

describe("StatsHeader", () => {
  it("marks the active period switcher button with aria-pressed", () => {
    render(<StatsHeader {...baseProps} />);

    const weekButton = screen.getByRole("button", { name: "周" });
    const monthButton = screen.getByRole("button", { name: "月" });
    const yearButton = screen.getByRole("button", { name: "年" });
    expect(weekButton).toHaveAttribute("aria-pressed", "false");
    expect(monthButton).toHaveAttribute("aria-pressed", "true");
    expect(yearButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(yearButton);
    expect(baseProps.setRangeType).toHaveBeenCalledWith("year");
  });

  it("navigates backward and only enables forward navigation for historical periods", () => {
    const { rerender } = render(<StatsHeader {...baseProps} />);

    const previousButton = screen.getByRole("button", { name: "上一周期" });
    const nextButton = screen.getByRole("button", { name: "下一周期" });
    expect(nextButton).toBeDisabled();

    fireEvent.click(previousButton);
    expect(baseProps.setPeriodOffset).toHaveBeenCalledWith(-1);

    rerender(<StatsHeader {...baseProps} periodOffset={-2} />);
    expect(nextButton).toBeEnabled();
    fireEvent.click(nextButton);
    expect(baseProps.setPeriodOffset).toHaveBeenCalledWith(-1);
  });
});
