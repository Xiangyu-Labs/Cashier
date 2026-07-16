import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CalculatorInput } from "@/components/ui/calculator-input";

describe("CalculatorInput", () => {
  it("keeps the same typography when switching into inline edit mode", () => {
    render(
      <CalculatorInput
        value={0}
        onChange={() => {}}
        displayClassName="text-3xl font-bold font-mono text-center"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Amount" }));
    const input = screen.getByRole("textbox");

    expect(input.className).toContain("font-mono");
    expect(input.className).toContain("text-3xl");
    expect(input.className).not.toContain("!text-base");
  });
});
