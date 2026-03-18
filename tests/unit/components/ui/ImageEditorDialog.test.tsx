import React, { forwardRef, useImperativeHandle } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const editorState = {
  hasPendingToolChanges: false,
  confirmedImage: {
    data: "data:image/jpeg;base64,confirmed",
    mimeType: "image/jpeg",
  },
  commitResult: {
    data: "data:image/jpeg;base64,pending-saved",
    mimeType: "image/jpeg",
  },
};

vi.mock("@/components/ui/image-editor", () => ({
  ImageEditor: forwardRef(function MockImageEditor(
    {
      onChange,
    }: {
      image: string;
      onChange: (editedImage: { data: string; mimeType: string }) => void;
    },
    ref: React.ForwardedRef<{
      hasPendingToolChanges: () => boolean;
      commitCurrentTool: () => { data: string; mimeType: string } | null;
      discardCurrentTool: () => void;
      getConfirmedImage: () => { data: string; mimeType: string };
    }>
  ) {
    useImperativeHandle(ref, () => ({
      hasPendingToolChanges: () => editorState.hasPendingToolChanges,
      commitCurrentTool: () => {
        onChange(editorState.commitResult);
        editorState.confirmedImage = editorState.commitResult;
        editorState.hasPendingToolChanges = false;
        return editorState.commitResult;
      },
      discardCurrentTool: () => {
        editorState.hasPendingToolChanges = false;
      },
      getConfirmedImage: () => editorState.confirmedImage,
    }));

    return <div>Mock editor</div>;
  }),
}));

import { ImageEditorDialog } from "@/components/ui/image-editor-dialog";

describe("ImageEditorDialog", () => {
  it("saves the latest confirmed image when closing the editor", () => {
    editorState.hasPendingToolChanges = false;
    editorState.confirmedImage = {
      data: "data:image/jpeg;base64,confirmed",
      mimeType: "image/jpeg",
    };

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

    fireEvent.click(screen.getByRole("button", { name: "关闭编辑器" }));

    expect(onSave).toHaveBeenCalledWith({
      data: "data:image/jpeg;base64,confirmed",
      mimeType: "image/jpeg",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks how to handle pending tool changes before closing", () => {
    editorState.hasPendingToolChanges = true;
    editorState.confirmedImage = {
      data: "data:image/jpeg;base64,confirmed",
      mimeType: "image/jpeg",
    };
    editorState.commitResult = {
      data: "data:image/jpeg;base64,pending-saved",
      mimeType: "image/jpeg",
    };

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

    fireEvent.click(screen.getByRole("button", { name: "关闭编辑器" }));

    expect(screen.getByText("当前编辑尚未保存")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith({
      data: "data:image/jpeg;base64,pending-saved",
      mimeType: "image/jpeg",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
