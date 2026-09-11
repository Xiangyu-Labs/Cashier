import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Checkbox } from "@/components/ui/checkbox";

describe("Checkbox", () => {
  it("outlines an unchecked box in a neutral colour, not the theme colour", () => {
    // Regression: the empty box used border-primary, so every unselected row
    // looked like it was already chosen.
    render(<Checkbox aria-label="全选" />);

    const box = screen.getByRole("checkbox", { name: "全选" });
    expect(box).toHaveClass("border-muted-foreground/40");
    expect(box).not.toHaveClass("border-primary");
  });

  it("shows a dash rather than a check when indeterminate", () => {
    // Radix mounts the indicator for the indeterminate state too, so without
    // this the partially-selected box drew a tick on an unfilled box.
    const { container } = render(<Checkbox aria-label="全选" checked="indeterminate" />);

    expect(container.querySelector(".lucide-minus")).toBeInTheDocument();
    expect(container.querySelector(".lucide-check")).toHaveClass(
      "group-data-[state=indeterminate]:hidden"
    );
  });
});
