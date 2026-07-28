import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModalStackRenderer } from "@/components/providers/ModalStackRenderer";
import { useModalStackStore } from "@/lib/store/modal-stack";

vi.mock("@/modules/ledger/ui", () => ({
  LedgerEntryDetailWrapper: ({
    open,
    onClose,
    onExitComplete,
  }: {
    open: boolean;
    onClose: () => void;
    onExitComplete?: () => void;
  }) => (
    <div data-testid="ledger-modal" data-open={open}>
      <button onClick={onClose}>close</button>
      {!open && <button onClick={onExitComplete}>exit complete</button>}
    </div>
  ),
}));

vi.mock("@/modules/source-document/ui", () => ({
  SourceDocumentDetailWrapper: () => null,
}));

describe("ModalStackRenderer", () => {
  beforeEach(() => useModalStackStore.setState({ stack: [] }));

  it("keeps the stack item mounted until its exit animation completes", async () => {
    render(<ModalStackRenderer categories={[]} />);
    act(() => {
      useModalStackStore.getState().push({
        type: "ledger-entry",
        id: "entry-1",
        ledgerId: "ledger-1",
      });
    });

    fireEvent.click(await screen.findByRole("button", { name: "close" }));
    expect(useModalStackStore.getState().stack).toHaveLength(1);
    expect(screen.getByTestId("ledger-modal")).toHaveAttribute("data-open", "false");

    fireEvent.click(screen.getByRole("button", { name: "exit complete" }));
    expect(useModalStackStore.getState().stack).toHaveLength(0);
  });
});
