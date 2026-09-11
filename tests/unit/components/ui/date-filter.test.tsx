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

  it("renders plain text without picker chrome when read-only", () => {
    // Regression: read-only surfaces used to pass `disabled`, which still
    // painted the outline button, calendar icon, and dropdown chevron.
    render(<DateFilter value="2026-07-28" onChange={() => {}} readOnly />);

    expect(screen.getByText("2026年7月28日")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps the read-only value at text-sm even when size is sm", () => {
    // Regression: the static read-only text inherited the interactive `sm`
    // size and rendered at text-xs, so the date looked smaller than the
    // surrounding row.
    render(<DateFilter value="2026-07-28" onChange={() => {}} readOnly size="sm" />);

    const value = screen.getByText("2026年7月28日");
    expect(value).toHaveClass("text-sm");
    expect(value).not.toHaveClass("text-xs");
  });

  it("does not open a calendar when the read-only value is clicked", () => {
    const onChange = vi.fn();
    render(<DateFilter value="2026-07-28" onChange={onChange} readOnly />);

    fireEvent.click(screen.getByText("2026年7月28日"));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("can drop the calendar marker and restyle the read-only value", () => {
    const { container } = render(
      <DateFilter
        value="2026-07-28"
        onChange={() => {}}
        readOnly
        hideReadOnlyIcon
        readOnlyTextClassName="text-base font-semibold"
      />
    );

    expect(container.querySelector(".lucide-calendar")).not.toBeInTheDocument();
    expect(screen.getByText("2026年7月28日")).toHaveClass("text-base", "font-semibold");
  });

  it("falls back to the interactive picker when read-only has no value", () => {
    render(<DateFilter value={null} onChange={() => {}} readOnly />);

    expect(screen.getByRole("button", { name: "selectDate" })).toBeInTheDocument();
  });
});
