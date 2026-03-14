import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSelection } from "@/hooks/use-selection";

describe("useSelection", () => {
    const allIds = ["id-1", "id-2", "id-3"];

    it("should select and deselect items", () => {
        const { result } = renderHook(() => useSelection({ allIds }));

        act(() => result.current.handleSelect("id-1", true));
        expect(result.current.selectedIds).toContain("id-1");

        act(() => result.current.handleSelect("id-1", false));
        expect(result.current.selectedIds).not.toContain("id-1");
    });

    it("should select all", () => {
        const { result } = renderHook(() => useSelection({ allIds }));

        act(() => result.current.handleSelectAll(true));
        expect(result.current.selectedIds).toEqual(allIds);
        expect(result.current.isAllSelected).toBe(true);
    });

    it("should exit selection mode and clear selections", () => {
        const { result } = renderHook(() => useSelection({ allIds }));

        act(() => result.current.toggleSelectionMode());
        act(() => result.current.handleSelect("id-1", true));
        expect(result.current.isSelectionMode).toBe(true);

        act(() => result.current.toggleSelectionMode());
        expect(result.current.isSelectionMode).toBe(false);
        expect(result.current.selectedIds).toHaveLength(0);
    });

    it("should clear selection", () => {
        const { result } = renderHook(() => useSelection({ allIds }));

        act(() => result.current.handleSelectAll(true));
        expect(result.current.selectedCount).toBe(3);

        act(() => result.current.clearSelection());
        expect(result.current.selectedIds).toHaveLength(0);
        expect(result.current.selectedCount).toBe(0);
    });

    it("should exit selection mode", () => {
        const { result } = renderHook(() => useSelection({ allIds }));

        act(() => result.current.toggleSelectionMode());
        act(() => result.current.handleSelect("id-1", true));

        act(() => result.current.exitSelectionMode());
        expect(result.current.isSelectionMode).toBe(false);
        expect(result.current.selectedIds).toHaveLength(0);
    });
});
