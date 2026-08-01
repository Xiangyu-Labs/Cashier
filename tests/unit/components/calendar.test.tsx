import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Calendar } from "@/components/ui/calendar";

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, string>) =>
        key === "dateFormat" ? `${values?.year}-${values?.month}` : key,
      { raw: () => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] }
    ),
}));

describe("Calendar", () => {
  it("changes months and resets the view when the controlled value changes", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Calendar value={new Date(2026, 0, 15)} onChange={onChange} showShortcuts={false} />
    );

    expect(screen.getByText("2026-1")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button")[1]!);
    expect(screen.getByText("2026-2")).toBeInTheDocument();

    rerender(<Calendar value={new Date(2026, 2, 20)} onChange={onChange} showShortcuts={false} />);
    expect(screen.getByText("2026-3")).toBeInTheDocument();
  });
});
