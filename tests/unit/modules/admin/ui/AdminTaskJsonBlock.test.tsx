import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminTaskJsonBlock } from "@/modules/admin/ui/AdminTaskJsonBlock";

describe("AdminTaskJsonBlock", () => {
  it("uses safe overflow container and selectable preformatted content", () => {
    render(
      <AdminTaskJsonBlock
        label="Input"
        value={{ message: "very long content" }}
        notAvailableLabel="-"
      />
    );

    const pre = screen
      .getByText(
        (_, element) =>
          element?.tagName === "PRE" &&
          (element.textContent ?? "").includes("very long content")
      )
      .closest("pre");
    expect(pre).toBeTruthy();
    expect(pre?.className).toContain("select-text");
    expect(pre?.className).toContain("whitespace-pre-wrap");

    const container = pre?.parentElement;
    expect(container?.className).toContain("overflow-x-auto");
    expect(container?.className).toContain("max-h-");
  });
});
