import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatsRanking } from "@/modules/stats/ui/StatsRanking";

describe("StatsRanking", () => {
  it("shows an empty state instead of rendering nothing", () => {
    render(<StatsRanking data={[]} currencySymbol="CNY" />);

    expect(screen.getByText("暂无统计")).toBeInTheDocument();
  });
});
