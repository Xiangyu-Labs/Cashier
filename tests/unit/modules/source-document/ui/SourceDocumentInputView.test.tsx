import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SourceDocumentInputView,
  type SourceDocumentInputViewProps,
} from "@/modules/source-document/ui/SourceDocumentInputView";

vi.mock("@/components/ui/date-filter", () => ({
  DateFilter: () => <div data-testid="date-filter" />,
}));

vi.mock("@/modules/source-document/ui/SourceDocumentImageModal", () => ({
  SourceDocumentImageModal: () => null,
}));

const messages: SourceDocumentInputViewProps["messages"] = {
  placeholder: "Record",
  image: "Image",
  send: "Send",
  retry: "Retry",
  delete: "Delete",
  sendingStatus: "Sending",
  entryDate: "Date",
  preparing: "Preparing",
  uploading: "Uploading",
  finalizing: "Finalizing",
  submitting: "Submitting",
  cancelling: "Cancelling",
  cancelUpload: "Cancel upload",
  uploadedImage: (index) => `Uploaded image ${index}`,
};

function renderView(
  progress: SourceDocumentInputViewProps["progress"],
  canCancelUpload: boolean,
  onCancelUpload = vi.fn()
) {
  return render(
    <SourceDocumentInputView
      mode="create"
      text="Lunch"
      entryDate={new Date("2026-07-17T00:00:00.000Z")}
      images={[]}
      selectedImageIndex={null}
      fileInputRef={createRef<HTMLInputElement>()}
      isPending
      isSubmitting={false}
      progress={progress}
      canSubmit
      canCancelUpload={canCancelUpload}
      messages={messages}
      onEntryDateChange={vi.fn()}
      onTextChange={vi.fn()}
      onTextareaPaste={vi.fn()}
      onFileInputChange={vi.fn()}
      onSelectImages={vi.fn()}
      onSubmit={vi.fn()}
      onCancelUpload={onCancelUpload}
      onRemoveImage={vi.fn()}
      onImageOpen={vi.fn()}
      onImageClose={vi.fn()}
    />
  );
}

describe("SourceDocumentInputView upload cancellation", () => {
  it("shows cancellation only while the batch is cancellable", () => {
    const onCancelUpload = vi.fn();
    const view = renderView({ phase: "uploading", percent: 70 }, true, onCancelUpload);

    fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    expect(onCancelUpload).toHaveBeenCalledTimes(1);

    view.rerender(
      <SourceDocumentInputView
        mode="create"
        text="Lunch"
        entryDate={new Date("2026-07-17T00:00:00.000Z")}
        images={[]}
        selectedImageIndex={null}
        fileInputRef={createRef<HTMLInputElement>()}
        isPending
        isSubmitting={false}
        progress={{ phase: "finalizing", percent: 88 }}
        canSubmit
        canCancelUpload={false}
        messages={messages}
        onEntryDateChange={vi.fn()}
        onTextChange={vi.fn()}
        onTextareaPaste={vi.fn()}
        onFileInputChange={vi.fn()}
        onSelectImages={vi.fn()}
        onSubmit={vi.fn()}
        onCancelUpload={onCancelUpload}
        onRemoveImage={vi.fn()}
        onImageOpen={vi.fn()}
        onImageClose={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Cancel upload" })).toBeNull();
    expect(screen.getByText("Finalizing")).toBeTruthy();
  });

  it("announces the cancelling phase without exposing another cancel action", () => {
    renderView({ phase: "cancelling", percent: 70 }, false);

    expect(screen.getByText("Cancelling")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel upload" })).toBeNull();
  });
});

describe("SourceDocumentInputView image labels", () => {
  it.each([
    ["Uploaded image", (index: number) => `Uploaded image ${index}`],
    ["已上传图片", (index: number) => `已上传图片 ${index}`],
  ])("uses localized 1-based labels beginning with %s", (_, uploadedImage) => {
    const localizedMessages = { ...messages, uploadedImage };
    render(
      <SourceDocumentInputView
        mode="create"
        text=""
        entryDate={new Date("2026-07-17T00:00:00.000Z")}
        images={[
          { data: "data:image/png;base64,first", mimeType: "image/png" },
          { data: "data:image/png;base64,second", mimeType: "image/png" },
        ]}
        selectedImageIndex={null}
        fileInputRef={createRef<HTMLInputElement>()}
        isPending={false}
        isSubmitting={false}
        progress={null}
        canSubmit
        canCancelUpload={false}
        messages={localizedMessages}
        onEntryDateChange={vi.fn()}
        onTextChange={vi.fn()}
        onTextareaPaste={vi.fn()}
        onFileInputChange={vi.fn()}
        onSelectImages={vi.fn()}
        onSubmit={vi.fn()}
        onCancelUpload={vi.fn()}
        onRemoveImage={vi.fn()}
        onImageOpen={vi.fn()}
        onImageClose={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: uploadedImage(1) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: uploadedImage(2) })).toBeInTheDocument();
    expect(screen.getByAltText(uploadedImage(1))).toBeInTheDocument();
    expect(screen.getByAltText(uploadedImage(2))).toBeInTheDocument();
  });
});
