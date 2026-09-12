import { describe, it, expect, beforeEach } from "vitest";
import { useModalStackStore } from "@/lib/store/modal-stack";

describe("Modal Stack Store", () => {
  beforeEach(() => {
    useModalStackStore.setState({ stack: [], canGoBack: false });
  });

  it("maintains back-navigation state across push, pop, and close", () => {
    useModalStackStore.getState().push({ type: "source-document", id: "1", ledgerId: "ledger-1" });
    useModalStackStore.getState().push({ type: "source-document", id: "2", ledgerId: "ledger-1" });
    expect(useModalStackStore.getState().canGoBack).toBe(true);
    expect(useModalStackStore.getState().isOpen("2")).toBe(true);

    useModalStackStore.getState().pop();
    expect(useModalStackStore.getState().stack.map((item) => item.id)).toEqual(["1"]);
    expect(useModalStackStore.getState().canGoBack).toBe(false);

    useModalStackStore.getState().closeAll();
    expect(useModalStackStore.getState().stack).toEqual([]);
  });

  it("truncates the stack when revisiting an existing entity", () => {
    const state = useModalStackStore.getState();
    state.push({ type: "source-document", id: "1", ledgerId: "ledger-1" });
    state.push({ type: "source-document", id: "2", ledgerId: "ledger-1" });
    state.push({ type: "source-document", id: "3", ledgerId: "ledger-1" });
    state.push({ type: "source-document", id: "1", ledgerId: "ledger-1" });

    expect(useModalStackStore.getState().stack).toEqual([
      { type: "source-document", id: "1", ledgerId: "ledger-1" },
    ]);
    expect(useModalStackStore.getState().canGoBack).toBe(false);
  });
});
