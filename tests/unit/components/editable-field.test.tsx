import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditableField } from "@/components/ui/editable-field";

describe("EditableField", () => {
  it("should render value in display mode", () => {
    render(<EditableField value="Test Value" onChange={() => {}} />);
    expect(screen.getByText("Test Value") !== null).toBe(true);
  });

  it("should render placeholder when value is empty", () => {
    render(<EditableField value="" onChange={() => {}} placeholder="Enter text" />);
    expect(screen.getByText("Enter text") !== null).toBe(true);
  });

  it("should switch to edit mode on click", () => {
    render(<EditableField value="Test" onChange={() => {}} />);
    const display = screen.getByText("Test");

    fireEvent.click(display);
    expect(screen.getByRole("textbox") !== null).toBe(true);
  });

  it("should call onChange when confirming edit", () => {
    const handleChange = vi.fn();
    render(<EditableField value="Test" onChange={handleChange} />);

    fireEvent.click(screen.getByText("Test"));
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "New Value" } });
    fireEvent.blur(input);

    expect(handleChange).toHaveBeenCalledWith("New Value");
  });

  it("should save on Enter key", () => {
    const handleChange = vi.fn();
    render(<EditableField value="Test" onChange={handleChange} />);

    fireEvent.click(screen.getByText("Test"));
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "New Value" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(handleChange).toHaveBeenCalledWith("New Value");
  });

  it("should cancel on Escape key", () => {
    const handleChange = vi.fn();
    render(<EditableField value="Test" onChange={handleChange} />);

    fireEvent.click(screen.getByText("Test"));
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "New Value" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(handleChange).not.toHaveBeenCalled();
    expect(screen.getByText("Test") !== null).toBe(true);
  });

  it("should render textarea when type is textarea", () => {
    render(<EditableField value="Test" onChange={() => {}} type="textarea" />);
    fireEvent.click(screen.getByText("Test"));

    const textbox = screen.getByRole("textbox");
    expect(textbox !== null).toBe(true);
    expect(textbox.tagName.toLowerCase()).toBe("textarea");
  });

  it("should render input when type is number", () => {
    render(<EditableField value="123" onChange={() => {}} type="number" />);
    fireEvent.click(screen.getByText("123"));

    const input = screen.getByRole("spinbutton");
    expect(input !== null).toBe(true);
    expect(input.getAttribute("type")).toBe("number");
  });

  it("should not allow editing when disabled", () => {
    render(<EditableField value="Test" onChange={() => {}} disabled />);
    const display = screen.getByText("Test");

    fireEvent.click(display);
    expect(screen.queryByRole("textbox") === null).toBe(true);
  });

  it("should use custom renderDisplay function", () => {
    render(
      <EditableField
        value="Test"
        onChange={() => {}}
        renderDisplay={(value) => <span data-testid="custom">{value.toUpperCase()}</span>}
      />
    );

    expect(screen.getByTestId("custom").textContent).toBe("TEST");
  });

  it("should confirm edit when clicking check button with saveOnBlur false", () => {
    const handleChange = vi.fn();
    render(<EditableField value="Test" onChange={handleChange} saveOnBlur={false} />);

    fireEvent.click(screen.getByText("Test"));
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "New Value" } });
    const buttons = screen.getAllByRole("button");
    if (buttons.length > 0) fireEvent.click(buttons[0]);

    expect(handleChange).toHaveBeenCalledWith("New Value");
  });

  it("should allow Shift+Enter for new line in textarea", () => {
    render(<EditableField value="Test" onChange={() => {}} type="textarea" />);
    fireEvent.click(screen.getByText("Test"));

    const textarea = screen.getByRole("textbox");
    const preventDefault = vi.fn();

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true, preventDefault });

    expect(preventDefault).not.toHaveBeenCalled();
  });
});
