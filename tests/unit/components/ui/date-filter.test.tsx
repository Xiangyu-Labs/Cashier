import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateFilter } from "@/components/ui/date-filter";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "zh-CN",
}));

describe("DateFilter", () => {
  it("renders a date-only string without shifting it to the previous day", () => {
    render(<DateFilter value="2026-07-28" onChange={() => {}} />);

    expect(screen.getByText("2026年7月28日")).toBeInTheDocument();
  });

  it("uses a real button to clear without opening the calendar", () => {
    const onChange = vi.fn();
    render(<DateFilter value="2026-07-28" onChange={onChange} />);

    const clear = screen.getByRole("button", { name: "clear" });
    expect(clear).toHaveAttribute("type", "button");
    fireEvent.click(clear);

    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("does not render a clear button when disabled, even with a value selected", () => {
    // Regression: a disabled DateFilter (e.g. a read-only detail view)
    // previously still rendered the X button, just visually greyed out and
    // non-functional, instead of omitting it entirely.
    render(<DateFilter value="2026-07-28" onChange={() => {}} disabled />);

    expect(screen.queryByRole("button", { name: "clear" })).not.toBeInTheDocument();
  });
});
