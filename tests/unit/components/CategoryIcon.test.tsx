import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CategoryIcon } from "@/components/CategoryIcon";

describe("CategoryIcon", () => {
  it("renders the configured category icon", () => {
    const { container } = render(<CategoryIcon iconName="Coffee" />);
    expect(container.querySelector("svg")).toHaveClass("lucide-coffee");
  });

  it("falls back to Package for missing, unsafe, unknown, and legacy values", () => {
    for (const iconName of [null, "constructor", "__proto__", "UnknownIcon", "🍕"]) {
      const { container, unmount } = render(<CategoryIcon iconName={iconName} />);
      expect(container.querySelector("svg")).toHaveClass("lucide-package");
      unmount();
    }
  });
});
