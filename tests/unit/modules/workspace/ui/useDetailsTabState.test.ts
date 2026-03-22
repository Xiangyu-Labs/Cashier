import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDetailsTabState } from "../../../../../src/modules/workspace/ui/useDetailsTabState";

describe("useDetailsTabState", () => {
  it("opens details modal when viewing an entry", () => {
    const { result } = renderHook(() => useDetailsTabState());
    const entry = { id: "entry-1" } as never;

    act(() => {
      result.current.handleViewEntry(entry);
    });

    expect(result.current.selectedLedgerEntry).toEqual(entry);
    expect(result.current.isDetailModalOpen).toBe(true);
  });

  it("closes details modal and clears selected entry", () => {
    const { result } = renderHook(() => useDetailsTabState());

    act(() => {
      result.current.handleViewEntry({ id: "entry-1" } as never);
      result.current.handleCloseDetail();
    });

    expect(result.current.isDetailModalOpen).toBe(false);
    expect(result.current.selectedLedgerEntry).toBeNull();
  });

  it("executes delete callback only when id is present and resets confirm state", () => {
    const { result } = renderHook(() => useDetailsTabState());
    const onDelete = vi.fn();

    act(() => {
      result.current.setDeleteConfirm({ open: true, id: "entry-1" });
    });

    act(() => {
      result.current.handleDeleteConfirm(onDelete);
    });

    expect(onDelete).toHaveBeenCalledWith("entry-1");
    expect(result.current.deleteConfirm).toEqual({ open: false, id: null });
  });

  it("does not execute delete callback when id is empty", () => {
    const { result } = renderHook(() => useDetailsTabState());
    const onDelete = vi.fn();

    act(() => {
      result.current.setDeleteConfirm({ open: true, id: "" });
      result.current.handleDeleteConfirm(onDelete);
    });

    expect(onDelete).not.toHaveBeenCalled();
  });
});
