import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModalStackRenderer } from "@/components/providers/ModalStackRenderer";
import { useModalStackStore } from "@/lib/store/modal-stack";

vi.mock("@/modules/ledger/ui", () => ({
  LedgerEntryDetailWrapper: ({
    open,
    onClose,
    onBack,
    onExitComplete,
  }: {
    open: boolean;
    onClose: () => void;
    onBack?: () => void;
    onExitComplete?: () => void;
  }) => (
    <div data-testid="ledger-modal" data-open={open}>
      <button onClick={onClose}>close</button>
      {onBack != null && <button onClick={onBack}>back</button>}
      {!open && onExitComplete != null && <button onClick={onExitComplete}>exit complete</button>}
    </div>
  ),
}));

vi.mock("@/modules/source-document/ui", () => ({
  SourceDocumentDetailWrapper: () => null,
}));

describe("ModalStackRenderer", () => {
  beforeEach(() => useModalStackStore.setState({ stack: [], canGoBack: false }));

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

  it("can reopen the same item after its exit completes", async () => {
    render(<ModalStackRenderer categories={[]} />);
    const item = { type: "ledger-entry" as const, id: "entry-1", ledgerId: "ledger-1" };

    act(() => useModalStackStore.getState().push(item));
    fireEvent.click(await screen.findByRole("button", { name: "close" }));
    fireEvent.click(screen.getByRole("button", { name: "exit complete" }));
    act(() => useModalStackStore.getState().push(item));

    expect(screen.getByTestId("ledger-modal")).toHaveAttribute("data-open", "true");
  });

  it("returns to the previous detail only after the top exit completes", async () => {
    render(<ModalStackRenderer categories={[]} />);
    act(() => {
      useModalStackStore
        .getState()
        .push({ type: "ledger-entry", id: "entry-1", ledgerId: "ledger-1" });
      useModalStackStore
        .getState()
        .push({ type: "ledger-entry", id: "entry-2", ledgerId: "ledger-1" });
    });

    fireEvent.click(await screen.findByRole("button", { name: "back" }));
    expect(useModalStackStore.getState().stack).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "exit complete" }));

    expect(useModalStackStore.getState().stack).toEqual([
      { type: "ledger-entry", id: "entry-1", ledgerId: "ledger-1" },
    ]);
    expect(screen.getByTestId("ledger-modal")).toHaveAttribute("data-open", "true");
  });
});
