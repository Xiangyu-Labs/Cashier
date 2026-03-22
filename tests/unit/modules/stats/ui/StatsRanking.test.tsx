import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StatsRanking } from "../../../../../src/modules/stats/ui/StatsRanking";

vi.mock("@/components/CategoryIcon", () => ({
  CategoryIcon: ({ iconName, className }: { iconName?: string | null; className?: string }) => (
    <span data-testid="category-icon" className={className}>
      {iconName ?? "default"}
    </span>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("StatsRanking", () => {
  it("renders loading skeleton state", () => {
    const { container } = render(<StatsRanking data={[]} isLoading />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("returns null when data is empty and not loading", () => {
    const { container } = render(<StatsRanking data={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("sorts categories by totalConverted descending", () => {
    const { container } = render(
      <StatsRanking
        data={[
          {
            id: "cat-a",
            name: "A",
            icon: "Utensils",
            totalConverted: 20,
            percent: 20,
            count: 1,
          },
          {
            id: "cat-b",
            name: "B",
            icon: "Bus",
            totalConverted: 80,
            percent: 80,
            count: 1,
          },
        ]}
      />
    );

    const text = container.textContent ?? "";
    expect(text.indexOf("B")).toBeLessThan(text.indexOf("A"));
  });

  it("maps null category id to __uncategorized__ on click", () => {
    const onCategoryClick = vi.fn();
    render(
      <StatsRanking
        data={[
          {
            id: null,
            name: "Uncategorized",
            icon: null,
            totalConverted: 10,
            percent: 100,
            count: 1,
          },
        ]}
        onCategoryClick={onCategoryClick}
      />
    );

    fireEvent.click(screen.getByText("Uncategorized"));
    expect(onCategoryClick).toHaveBeenCalledWith("__uncategorized__");
  });

  it("shows trend badge only when absolute trend percent is significant", () => {
    render(
      <StatsRanking
        data={[
          {
            id: "cat-1",
            name: "Food",
            icon: "Utensils",
            totalConverted: 100,
            percent: 70,
            count: 3,
            trend: { percent: 11, amount: 15 },
          },
          {
            id: "cat-2",
            name: "Transport",
            icon: "Bus",
            totalConverted: 40,
            percent: 30,
            count: 2,
            trend: { percent: 8, amount: 5 },
          },
        ]}
      />
    );

    expect(screen.getByText("15")).toBeDefined();
    expect(screen.queryByText("5")).toBeNull();
  });
});
