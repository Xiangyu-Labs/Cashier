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
});
