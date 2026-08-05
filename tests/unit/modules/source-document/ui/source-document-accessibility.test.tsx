import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessingStatus } from "@/modules/source-document/ui/processing-status";
import { SourceDocumentImageModal } from "@/modules/source-document/ui/SourceDocumentImageModal";

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
  let reducedMotion = false;

  beforeEach(() => {
    reducedMotion = false;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: reducedMotion,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

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

  it("keeps the spinning ring for processing under normal motion preferences", () => {
    render(<ProcessingStatus status="processing" />);
    const indicator = screen.getByRole("status").querySelector("span[aria-hidden]");
    expect(indicator).not.toBeNull();
    expect(indicator).toHaveClass("animate-spin");
    expect(indicator).toHaveClass("border-t-primary");
  });

  it("replaces the frozen ring with a solid dot for processing under reduced motion", () => {
    reducedMotion = true;
    render(<ProcessingStatus status="processing" />);
    const indicator = screen.getByRole("status").querySelector("span[aria-hidden]");
    expect(indicator).not.toBeNull();
    expect(indicator).not.toHaveClass("animate-spin");
    expect(indicator).not.toHaveClass("border-t-primary");
    expect(indicator).toHaveClass("bg-primary/70");
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
});
