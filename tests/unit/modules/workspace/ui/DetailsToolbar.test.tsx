import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DetailsToolbar } from "@/modules/workspace/ui/DetailsToolbar";

describe("DetailsToolbar", () => {
  it("renders total label and children", () => {
    render(
      <DetailsToolbar totalLabel="CNY 12.00">
        <button type="button">Filter</button>
      </DetailsToolbar>
    );

    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
    expect(screen.getByText("CNY 12.00")).toBeInTheDocument();
    expect(screen.queryByLabelText(/select entries/i)).not.toBeInTheDocument();
  });
});
