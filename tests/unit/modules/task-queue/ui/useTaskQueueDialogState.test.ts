import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTaskQueueDialogState } from "@/modules/task-queue/ui/useTaskQueueDialogState";

describe("useTaskQueueDialogState", () => {
  it("opens and closes delete confirms without clearing the payload", () => {
    const { result } = renderHook(() => useTaskQueueDialogState());

    act(() => {
      result.current.openSingleDeleteConfirm("doc-1", "Delete", "Confirm?");
    });

    expect(result.current.deleteConfirm).toEqual({
      open: true,
      type: "single",
      id: "doc-1",
      title: "Delete",
      description: "Confirm?",
    });

    act(() => {
      result.current.closeDeleteConfirm();
    });

    expect(result.current.deleteConfirm.open).toBe(false);
    expect(result.current.deleteConfirm.type).toBe("single");
    expect(result.current.deleteConfirm.id).toBe("doc-1");
    expect(result.current.deleteConfirm.title).toBe("Delete");
    expect(result.current.deleteConfirm.description).toBe("Confirm?");
  });

  it("opens retry and delete-all state through semantic helpers", () => {
    const { result } = renderHook(() => useTaskQueueDialogState());

    act(() => {
      result.current.setRetrySourceDocId("doc-2");
      result.current.openDeleteAllConfirm("Delete all", "Delete everything?");
    });

    expect(result.current.retrySourceDocId).toBe("doc-2");
    expect(result.current.deleteConfirm).toEqual({
      open: true,
      type: "all",
      id: null,
      title: "Delete all",
      description: "Delete everything?",
    });

    act(() => {
      result.current.closeRetryDialog();
    });

    expect(result.current.retrySourceDocId).toBeNull();
  });
});
