import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProcessingStatus } from "@/modules/source-document/ui/processing-status";
import { SourceDocumentImageModal } from "@/modules/source-document/ui/SourceDocumentImageModal";
import { SourceDocumentCardPreview } from "@/modules/source-document/ui/SourceDocumentCardPreview";

function ImageDialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open images
      </button>
      <SourceDocumentImageModal
        images={[
          { data: "data:image/png;base64,AA==", mimeType: "image/png" },
          { data: "data:image/png;base64,AQ==", mimeType: "image/png" },
        ]}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

describe("source document accessibility", () => {
  it("announces processing, failure, and success state changes", () => {
    const { rerender } = render(<ProcessingStatus status="processing" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");

    rerender(<ProcessingStatus status="error" />);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");

    rerender(<ProcessingStatus status="completed" />);
    expect(screen.getByRole("status")).toHaveTextContent(/completed|完成/i);

    rerender(<ProcessingStatus status="error" label="Parsing failed" />);
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });

  it("supports keyboard image navigation, Escape dismissal, and focus return", async () => {
    const user = userEvent.setup();
    render(<ImageDialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open images" });
    trigger.focus();
    await user.click(trigger);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next image|下一张图片/i })).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("heading", { name: /2\/2/ })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("opens image previews from the keyboard", async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    render(
      <SourceDocumentCardPreview
        text=""
        images={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            contentType: "image/png",
            byteSize: 1,
            originalFilename: null,
          },
        ]}
        onViewDetails={onViewDetails}
      />
    );

    const preview = screen.getByRole("button", { name: /image 1|图片 1/i });
    preview.focus();
    await user.keyboard("{Enter}");
    expect(onViewDetails).toHaveBeenCalledTimes(1);
  });
});
