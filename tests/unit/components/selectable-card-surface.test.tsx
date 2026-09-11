import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SelectableCardSurface } from "@/components/selectable-card-surface";

describe("SelectableCardSurface", () => {
  it("freezes its content and exposes one full-card checkbox interaction", async () => {
    const user = userEvent.setup();
    const onToggleSelection = vi.fn();
    const onInternalClick = vi.fn();

    render(
      <SelectableCardSurface
        selectionMode
        selected={false}
        selectionLabel="Select lunch"
        onToggleSelection={onToggleSelection}
      >
        <button type="button" onClick={onInternalClick}>
          Edit lunch
        </button>
      </SelectableCardSurface>
    );

    const overlay = screen.getByRole("checkbox", { name: "Select lunch" });
    const content = screen.getByRole("button", { name: "Edit lunch", hidden: true }).parentElement;

    expect(overlay).toHaveAttribute("aria-checked", "false");
    expect(content).toHaveAttribute("inert");
    await user.click(overlay);
    expect(onToggleSelection).toHaveBeenCalledTimes(1);
    expect(onInternalClick).not.toHaveBeenCalled();

    overlay.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onToggleSelection).toHaveBeenCalledTimes(3);
  });

  it("restores the original content interaction after selection mode exits", async () => {
    const user = userEvent.setup();
    const onInternalClick = vi.fn();
    const { rerender } = render(
      <SelectableCardSurface
        selectionMode
        selected
        selectionLabel="Select lunch"
        onToggleSelection={vi.fn()}
      >
        <button type="button" onClick={onInternalClick}>
          Edit lunch
        </button>
      </SelectableCardSurface>
    );

    rerender(
      <SelectableCardSurface
        selectionMode={false}
        selected={false}
        selectionLabel="Select lunch"
        onToggleSelection={vi.fn()}
      >
        <button type="button" onClick={onInternalClick}>
          Edit lunch
        </button>
      </SelectableCardSurface>
    );

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Edit lunch" });
    expect(button.parentElement).not.toHaveAttribute("inert");
    await user.click(button);
    expect(onInternalClick).toHaveBeenCalledTimes(1);
  });

  it("outlines the unselected box neutrally and fills it only when selected", () => {
    // Regression: the empty box carried border-primary, so every row in
    // selection mode looked pre-selected.
    const { container } = render(
      <SelectableCardSurface
        selectionMode
        selected={false}
        selectionLabel="Select lunch"
        onToggleSelection={vi.fn()}
      >
        <div>Lunch</div>
      </SelectableCardSurface>
    );

    const box = container.querySelector('[aria-hidden="true"].absolute.left-3');
    expect(box).toHaveClass("border-muted-foreground/40");
    expect(box).not.toHaveClass("border-primary");
  });

  it("disables an unselected card when the selection limit is reached", async () => {
    const user = userEvent.setup();
    const onToggleSelection = vi.fn();
    render(
      <SelectableCardSurface
        selectionMode
        selected={false}
        disabled
        selectionLabel="Select lunch"
        onToggleSelection={onToggleSelection}
      >
        <div>Lunch</div>
      </SelectableCardSurface>
    );

    const overlay = screen.getByRole("checkbox", { name: "Select lunch" });
    expect(overlay).toBeDisabled();
    await user.click(overlay);
    expect(onToggleSelection).not.toHaveBeenCalled();
  });
});
