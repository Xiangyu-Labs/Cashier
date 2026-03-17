import { describe, it, expect, beforeEach } from "vitest";
import { useModalStackStore } from "@/lib/store/modal-stack";

describe("Modal Stack Store", () => {
  beforeEach(() => {
    useModalStackStore.setState({ stack: [] });
  });

  it("should start with an empty stack", () => {
    const state = useModalStackStore.getState();
    expect(state.stack).toEqual([]);
  });

  it("should push a modal onto the stack", () => {
    useModalStackStore.getState().push({ type: "ledger-entry", id: "1" });
    const state = useModalStackStore.getState();
    expect(state.stack).toHaveLength(1);
    expect(state.stack[0]).toEqual({ type: "ledger-entry", id: "1" });
  });

  it("should stack multiple modals", () => {
    useModalStackStore.getState().push({ type: "ledger-entry", id: "1" });
    useModalStackStore.getState().push({ type: "source-document", id: "2" });
    const state = useModalStackStore.getState();
    expect(state.stack).toHaveLength(2);
    expect(state.stack[0]).toEqual({ type: "ledger-entry", id: "1" });
    expect(state.stack[1]).toEqual({ type: "source-document", id: "2" });
  });

  it("should pop the top modal", () => {
    useModalStackStore.getState().push({ type: "ledger-entry", id: "1" });
    useModalStackStore.getState().push({ type: "source-document", id: "2" });

    useModalStackStore.getState().pop();

    const state = useModalStackStore.getState();
    expect(state.stack).toHaveLength(1);
    expect(state.stack[0]).toEqual({ type: "ledger-entry", id: "1" });
  });

  it("should close all modals", () => {
    useModalStackStore.getState().push({ type: "ledger-entry", id: "1" });
    useModalStackStore.getState().push({ type: "source-document", id: "2" });

    useModalStackStore.getState().closeAll();

    const state = useModalStackStore.getState();
    expect(state.stack).toEqual([]);
  });

  it("should check if a modal is open", () => {
    useModalStackStore.getState().push({ type: "ledger-entry", id: "1" });
    const state = useModalStackStore.getState();

    expect(state.isOpen("1")).toBe(true);
    expect(state.isOpen("2")).toBe(false);
  });
});
