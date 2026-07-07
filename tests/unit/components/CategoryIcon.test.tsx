import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryIcon } from "@/components/CategoryIcon";

describe("CategoryIcon", () => {
  it("falls back to a vector icon instead of rendering emoji text", () => {
    const { container } = render(<CategoryIcon iconName="🍜" className="h-4 w-4" />);

    expect(screen.queryByText("🍜")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
