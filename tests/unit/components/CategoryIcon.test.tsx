import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
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

  it.each(["constructor", "__proto__", "toString", "UnknownIcon"])(
    "renders Package for unsafe or unknown name %s",
    (iconName) => {
      const { container } = render(<CategoryIcon iconName={iconName} />);
      expect(container.querySelector("svg")).toBeInTheDocument();
      expect(container).not.toHaveTextContent(iconName);
    }
  );

  it("renders Package for legacy emoji values", () => {
    const { container } = render(<CategoryIcon iconName="🍕" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("🍕");
  });
});
