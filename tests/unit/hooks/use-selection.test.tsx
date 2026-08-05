import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSelection } from "@/hooks/use-selection";

const ALL_IDS = ["one", "two", "two"];

describe("useSelection", () => {
  it("keeps repeated select and deselect events idempotent", () => {
    const { result } = renderHook(() => useSelection({ allIds: ALL_IDS }));

    act(() => {
      result.current.handleSelect("one", true);
      result.current.handleSelect("one", true);
    });
    expect(result.current.selectedIds).toEqual(["one"]);

    act(() => {
      result.current.handleSelect("one", false);
      result.current.handleSelect("one", false);
    });
    expect(result.current.selectedIds).toEqual([]);
  });

  it("deduplicates IDs when selecting all", () => {
    const { result } = renderHook(() => useSelection({ allIds: ALL_IDS }));

    act(() => result.current.selectAll());
    expect(result.current.selectedIds).toEqual(["one", "two"]);
    expect(result.current.isAllSelected).toBe(true);
  });

  it("exits selection mode on Escape when no overlay is open", () => {
    const { result } = renderHook(() => useSelection({ allIds: ALL_IDS }));

    act(() => {
      result.current.setSelectionMode(true);
      result.current.selectAll();
    });
    expect(result.current.isSelectionMode).toBe(true);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(result.current.isSelectionMode).toBe(false);
    expect(result.current.selectedIds).toEqual([]);
  });

  it("keeps selection mode while a Radix overlay is open", () => {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-radix-dialog-content", "");
    overlay.setAttribute("data-state", "open");
    document.body.appendChild(overlay);

    const { result } = renderHook(() => useSelection({ allIds: ALL_IDS }));
    act(() => {
      result.current.setSelectionMode(true);
      result.current.selectAll();
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(result.current.isSelectionMode).toBe(true);
    expect(result.current.selectedIds).toEqual(["one", "two"]);
    overlay.remove();
  });
});
