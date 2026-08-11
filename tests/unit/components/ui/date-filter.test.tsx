import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateFilter } from "@/components/ui/date-filter";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "zh-CN",
}));

describe("DateFilter", () => {
  it("applies truncate class by default", () => {
    render(<DateFilter value={new Date(2026, 3, 17)} onChange={() => {}} />);

    const dateText = screen.getByText("2026年4月17日");
    expect(dateText.tagName.toLowerCase()).toBe("span");
    expect(dateText.classList.contains("truncate")).toBe(true);
  });

  it("does not apply truncate class when truncate prop is false", () => {
    render(<DateFilter value={new Date(2026, 3, 17)} onChange={() => {}} truncate={false} />);

    const dateText = screen.getByText("2026年4月17日");
    expect(dateText.classList.contains("truncate")).toBe(false);
    expect(dateText.classList.contains("whitespace-nowrap")).toBe(true);
  });

  it("parses a date-only string as a local civil date", () => {
    render(<DateFilter value="2026-04-17" onChange={() => {}} />);

    expect(screen.getByText("2026年4月17日")).toBeInTheDocument();
  });

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
});
