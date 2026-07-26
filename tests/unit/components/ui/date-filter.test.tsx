import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DateFilter } from "@/components/ui/date-filter";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    dateTime: (date: Date) =>
      date.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
  }),
}));

describe("DateFilter", () => {
  it("applies truncate class by default", () => {
    render(<DateFilter value={new Date("2026-04-17")} onChange={() => {}} />);

    const dateText = screen.getByText("2026年4月17日");
    expect(dateText.tagName.toLowerCase()).toBe("span");
    expect(dateText.classList.contains("truncate")).toBe(true);
  });

  it("does not apply truncate class when truncate prop is false", () => {
    render(<DateFilter value={new Date("2026-04-17")} onChange={() => {}} truncate={false} />);

    const dateText = screen.getByText("2026年4月17日");
    expect(dateText.classList.contains("truncate")).toBe(false);
    expect(dateText.classList.contains("whitespace-nowrap")).toBe(true);
  });
});
