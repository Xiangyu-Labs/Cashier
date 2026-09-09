import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CategoryIcon } from "@/components/CategoryIcon";

describe("CategoryIcon", () => {
  it("falls back to Package for missing, unsafe, unknown, and legacy values", () => {
    for (const iconName of [null, "constructor", "__proto__", "UnknownIcon", "🍕"]) {
      const { container, unmount } = render(<CategoryIcon iconName={iconName} />);
      expect(container.querySelector("svg")).toHaveClass("lucide-package");
      unmount();
    }
  });
});
