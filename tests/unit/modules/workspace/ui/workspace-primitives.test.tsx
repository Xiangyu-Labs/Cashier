import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "@/modules/workspace/ui/EmptyState";
import { EntryGroupHeader } from "@/modules/workspace/ui/EntryGroupHeader";

describe("workspace primitives", () => {
  it("renders an accessible empty state with an optional action", () => {
    render(<EmptyState title="No entries" description="Start by recording one." actionLabel="Record" onAction={vi.fn()} />);

    expect(screen.getByText("No entries")).toBeInTheDocument();
    expect(screen.getByText("Start by recording one.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record" })).toBeInTheDocument();
  });

  it("renders a ledger-like group header with tabular totals", () => {
    render(<EntryGroupHeader title="2026-07-07" totalLabel="CNY 123.00" />);

    expect(screen.getByText("2026-07-07")).toBeInTheDocument();
    expect(screen.getByText("CNY 123.00")).toHaveClass("tabular-nums");
  });
});
