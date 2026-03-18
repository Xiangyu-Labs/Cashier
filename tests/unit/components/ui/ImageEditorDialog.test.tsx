import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/components/ui/image-editor", () => ({
  ImageEditor: ({
    image,
    onChange,
  }: {
    image: string;
    onChange: (editedImage: { data: string; mimeType: string }) => void;
  }) => (
    <>
      <button
        type="button"
        onClick={() =>
          onChange({
            data: "data:image/jpeg;base64,edited",
            mimeType: "image/jpeg",
          })
        }
      >
        Simulate edit
      </button>
      <button
        type="button"
        onClick={() =>
          onChange({
            data: image,
            mimeType: "image/png",
          })
        }
      >
        Simulate reset
      </button>
    </>
  ),
}));

import { ImageEditorDialog } from "@/components/ui/image-editor-dialog";

describe("ImageEditorDialog", () => {
  it("only submits edits through the footer save button", () => {
    const onOpenChange = vi.fn();
    const onSave = vi.fn();

    render(
      <ImageEditorDialog
        image="data:image/png;base64,original"
        open
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    );

    const saveButton = screen.getByRole("button", { name: "保存" });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Simulate edit" }));
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledWith({
      data: "data:image/jpeg;base64,edited",
      mimeType: "image/jpeg",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps save disabled when the editor returns to the original image", () => {
    const onSave = vi.fn();

    render(
      <ImageEditorDialog
        image="data:image/png;base64,original"
        open
        onOpenChange={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Simulate edit" }));
    expect((screen.getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled).toBe(
      false
    );

    fireEvent.click(screen.getByRole("button", { name: "Simulate reset" }));

    expect((screen.getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(onSave).not.toHaveBeenCalled();
  });
});
