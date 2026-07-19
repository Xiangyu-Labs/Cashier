import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategoryIcon } from "@/components/CategoryIcon";

describe("CategoryIcon", () => {
  it("renders a configured icon by name", () => {
    const { container } = render(<CategoryIcon iconName="Coffee" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders default Package icon when iconName is null", () => {
    const { container } = render(<CategoryIcon iconName={null} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders text fallback for unknown icon names", () => {
    render(<CategoryIcon iconName="🍕" />);
    expect(screen.getByText("🍕")).toBeInTheDocument();
  });
});
