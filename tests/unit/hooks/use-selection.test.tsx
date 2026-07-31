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
});
