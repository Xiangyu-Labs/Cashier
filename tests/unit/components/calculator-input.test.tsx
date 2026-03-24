import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalculatorInput } from "@/components/ui/calculator-input";

describe("CalculatorInput", () => {
  it("should render value in display mode", () => {
    render(<CalculatorInput value={100.5} onChange={() => {}} />);
    expect(screen.getByText("100.50") !== null).toBe(true);
  });

  it("should switch to input mode on click", () => {
    render(<CalculatorInput value={100} onChange={() => {}} />);
    fireEvent.click(screen.getByText("100.00"));
    expect(screen.getByRole("textbox") !== null).toBe(true);
  });

  it("keeps the same typography when switching into inline edit mode", () => {
    render(
      <CalculatorInput
        value={0}
        onChange={() => {}}
        displayClassName="text-3xl font-bold font-mono text-center"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "0.00" }));
    const input = screen.getByRole("textbox");

    expect(input.className).toContain("font-mono");
    expect(input.className).toContain("text-3xl");
    expect(input.className).not.toContain("!text-base");
  });

  it("treats inline digit typing as minor units", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<CalculatorInput value={0} onChange={onChange} inlineInputMode="minor-unit" />);

    fireEvent.click(screen.getByRole("button", { name: "0.00" }));
    const input = screen.getByRole("textbox");

    await user.type(input, "1300{Enter}");

    expect(onChange).toHaveBeenCalledWith(13);
  });

  it("keeps minor-unit semantics when deleting digits", async () => {
    const user = userEvent.setup();

    render(<CalculatorInput value={0} onChange={() => {}} inlineInputMode="minor-unit" />);

    fireEvent.click(screen.getByRole("button", { name: "0.00" }));
    const input = screen.getByRole("textbox") as HTMLInputElement;

    await user.type(input, "1454");
    expect(input.value).toBe("14.54");

    await user.type(input, "{Backspace}");
    expect(input.value).toBe("1.45");
  });

  it("keeps decimal inline typing in the default mode", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<CalculatorInput value={0} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "0.00" }));
    const input = screen.getByRole("textbox");

    await user.type(input, "200.50{Enter}");

    expect(onChange).toHaveBeenCalledWith(200.5);
  });

  it("should call onChange when confirming input", () => {
    const handleChange = vi.fn();
    render(<CalculatorInput value={100} onChange={handleChange} />);

    fireEvent.click(screen.getByText("100.00"));
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "200.50" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(handleChange).toHaveBeenCalledWith(200.5);
  });

  it("should cancel on Escape key", () => {
    const handleChange = vi.fn();
    render(<CalculatorInput value={100} onChange={handleChange} />);

    fireEvent.click(screen.getByText("100.00"));
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "200" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(handleChange).not.toHaveBeenCalled();
    expect(screen.getByText("100.00") !== null).toBe(true);
  });

  it("should open calculator dialog when clicking calculator button", () => {
    render(<CalculatorInput value={100} onChange={() => {}} />);

    fireEvent.click(screen.getByText("100.00"));
    fireEvent.click(screen.getByTitle("Open calculator"));

    expect(screen.getByRole("dialog") !== null).toBe(true);
  });

  it("should handle clear button", () => {
    const handleChange = vi.fn();
    render(<CalculatorInput value={100} onChange={handleChange} />);

    fireEvent.click(screen.getByText("100.00"));
    fireEvent.click(screen.getByTitle("Open calculator"));

    // Find the AC button by text content
    const acButton = screen.queryByText("AC");
    expect(acButton !== null).toBe(true);
    if (acButton) {
      fireEvent.click(acButton);
      // After clearing, dialog should still be open with 0 displayed
      expect(screen.getByRole("dialog") !== null).toBe(true);
    }
  });

  it("should be disabled when disabled prop is true", () => {
    render(<CalculatorInput value={100} onChange={() => {}} disabled />);
    const button = screen.getByText("100.00");

    // When disabled, clicking should not open input mode
    fireEvent.click(button);
    // Input should not appear when disabled
    expect(screen.queryByRole("textbox") === null).toBe(true);
  });

  it("should validate number input", () => {
    render(<CalculatorInput value={100} onChange={() => {}} />);

    fireEvent.click(screen.getByText("100.00"));
    const input = screen.getByRole("textbox");

    // Invalid input should not be accepted
    fireEvent.change(input, { target: { value: "abc" } });
    expect(input.getAttribute("value")).toBe("100.00");
  });

  it("should accept valid decimal input", () => {
    render(<CalculatorInput value={100} onChange={() => {}} />);

    fireEvent.click(screen.getByText("100.00"));
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "150.75" } });
    expect(input.getAttribute("value")).toBe("150.75");
  });
});
