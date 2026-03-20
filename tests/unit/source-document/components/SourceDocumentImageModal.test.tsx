import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SourceDocumentImageModal } from "@/modules/source-document/ui";

vi.mock("@/components/ui/image-editor", () => ({
  ImageEditor: ({
    onChange,
  }: {
    image: string;
    onChange: (editedImage: { data: string; mimeType: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          data: "data:image/jpeg;base64,edited",
          mimeType: "image/jpeg",
        })
      }
    >
      mock-image-editor
    </button>
  ),
}));

describe("SourceDocumentImageModal", () => {
  const images = [{ data: "data:image/png;base64,original", mimeType: "image/png" }];

  it("does not show editing controls in read-only mode", () => {
    render(
      <SourceDocumentImageModal images={images} open initialIndex={0} editable={false} onOpenChange={vi.fn()} />
    );

    expect(screen.queryByRole("button", { name: "编辑当前图片" })).toBeNull();
  });

  it("returns edited images when closing after a saved edit", async () => {
    const onSave = vi.fn();

    render(
      <SourceDocumentImageModal
        images={images}
        open
        initialIndex={0}
        editable
        onOpenChange={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑当前图片" }));
    fireEvent.click(screen.getByRole("button", { name: "mock-image-editor" }));
    fireEvent.click(screen.getByRole("button", { name: "返回查看" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(onSave).toHaveBeenCalledWith([
      {
        data: "data:image/jpeg;base64,edited",
        mimeType: "image/jpeg",
      },
    ]);
  });
});
