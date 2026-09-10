import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatsRanking } from "@/modules/stats/ui/StatsRanking";

describe("StatsRanking", () => {
  it("shows an empty state instead of rendering nothing", () => {
    render(<StatsRanking data={[]} currencySymbol="CNY" />);

    expect(screen.getByText("暂无统计")).toBeInTheDocument();
  });

  it("hides percentages when a category has a negative net expense", () => {
    render(
      <StatsRanking
        currencySymbol="CNY"
        data={[
          { id: "food", name: "Dining", icon: null, totalConverted: "30", percent: 120, count: 2 },
          {
            id: "discount",
            name: "Discount",
            icon: null,
            totalConverted: "-5",
            percent: -20,
            count: 1,
          },
        ]}
      />
    );

    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});
