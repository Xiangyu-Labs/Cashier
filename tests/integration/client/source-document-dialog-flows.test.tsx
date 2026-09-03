import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function SourceDocumentDialogHarness({
  onConfirm,
}: {
  onConfirm: () => boolean | Promise<boolean>;
}) {
  const [parentOpen, setParentOpen] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(true);
  return (
    <Dialog open={parentOpen} onOpenChange={setParentOpen}>
      <DialogContent variant="detail" aria-describedby={undefined}>
        <DialogTitle>Bill details</DialogTitle>
        <span>Parent content</span>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Confirm source document action"
          description="This changes the bill."
          confirmLabel="Confirm action"
          cancelLabel="Cancel action"
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}

describe("source-document dialog control flows", () => {
  it("locks a pending confirmation and closes after success", async () => {
    const confirmation = deferred<boolean>();
    render(<SourceDocumentDialogHarness onConfirm={() => confirmation.promise} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm action" }));
    expect(screen.getByRole("button", { name: "Confirm action" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel action" })).toBeDisabled();

    confirmation.resolve(true);
    await waitFor(() =>
      expect(screen.queryByText("Confirm source document action")).not.toBeInTheDocument()
    );
    expect(screen.getByText("Parent content")).toBeInTheDocument();
  });

  it("keeps the confirmation open when the action returns false", async () => {
    render(<SourceDocumentDialogHarness onConfirm={() => false} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm action" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirm action" })).not.toBeDisabled()
    );
    expect(screen.getByText("Confirm source document action")).toBeInTheDocument();
  });

  it("closes only the nested confirmation when cancelled", async () => {
    render(<SourceDocumentDialogHarness onConfirm={() => true} />);
    expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Cancel action" }));

    await waitFor(() => expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(1));
    expect(screen.getByText("Parent content")).toBeInTheDocument();
  });
});
