import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DetailsToolbar } from "@/modules/workspace/ui/DetailsToolbar";

describe("DetailsToolbar", () => {
  it("shows filter controls in normal mode", () => {
    render(
      <DetailsToolbar
        hasEntries
        isSelectionMode={false}
        selectedCount={0}
        selectedLabel="Selected 0"
        totalLabel="CNY 100.00"
        onToggleSelectionMode={vi.fn()}
        onClearSelection={vi.fn()}
        batchActions={[]}
      >
        <button type="button">Filters</button>
      </DetailsToolbar>
    );

    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByText("CNY 100.00")).toBeInTheDocument();
  });

  it("shows batch actions in selection mode", async () => {
    const user = userEvent.setup();
    const onClearSelection = vi.fn();

    render(
      <DetailsToolbar
        hasEntries
        isSelectionMode
        selectedCount={2}
        selectedLabel="Selected 2"
        totalLabel="CNY 100.00"
        onToggleSelectionMode={vi.fn()}
        onClearSelection={onClearSelection}
        batchActions={[{ label: "Delete", iconLabel: "Delete", onClick: vi.fn(), variant: "danger" }]}
      />
    );

    expect(screen.getByText("Selected 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onClearSelection).toHaveBeenCalledOnce();
  });
});
