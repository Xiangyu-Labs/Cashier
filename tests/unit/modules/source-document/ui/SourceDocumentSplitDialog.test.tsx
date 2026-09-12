import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SourceDocumentSplitDialog } from "@/modules/source-document/ui/SourceDocumentSplitDialog";

describe("SourceDocumentSplitDialog", () => {
  it("initializes the required date and submits the value picked from the picker", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <SourceDocumentSplitDialog
        open
        selectedCount={2}
        initialDate="2026-08-16"
        isSubmitting={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />
    );
    // The field is the app's shared date picker: it paints the initial date and
    // takes a new one from the calendar.
    const date = screen.getByLabelText(/splitDate|新账单日期/i);
    expect(date).toHaveTextContent("2026年8月16日");
    fireEvent.click(date);
    fireEvent.click(document.querySelector('[data-calendar-date="2026-08-18"]') as HTMLElement);
    await userEvent.click(screen.getByRole("button", { name: /splitTitle|拆分账单/i }));
    expect(onSubmit).toHaveBeenCalledWith("2026-08-18");
  });

  it("locks dismissal and submission while pending", () => {
    const onOpenChange = vi.fn();
    render(
      <SourceDocumentSplitDialog
        open
        selectedCount={1}
        initialDate="2026-08-16"
        isSubmitting
        onOpenChange={onOpenChange}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/splitDate|新账单日期/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel|取消/i })).toBeDisabled();
  });
});
