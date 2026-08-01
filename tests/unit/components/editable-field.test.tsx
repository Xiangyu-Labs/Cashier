import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditableField } from "@/components/ui/editable-field";

describe("EditableField", () => {
  it("starts from the latest value and restores it when editing is cancelled", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <EditableField value="Initial" onChange={onChange} saveOnBlur={false} />
    );

    rerender(<EditableField value="Updated" onChange={onChange} saveOnBlur={false} />);
    fireEvent.click(screen.getByText("Updated"));
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("Updated");

    fireEvent.change(input, { target: { value: "Draft" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
