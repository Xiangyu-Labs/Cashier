import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLedgerEntriesTabState } from "./useLedgerEntriesTabState";

describe("useLedgerEntriesTabState", () => {
  it("opens source-document delete confirm with payload", () => {
    const { result } = renderHook(() => useLedgerEntriesTabState());

    act(() => {
      result.current.openSourceDocumentDeleteConfirm("doc-1", "Confirm", "Delete this?");
    });

    expect(result.current.deleteConfirm).toEqual({
      open: true,
      type: "sourceDocument",
      id: "doc-1",
      title: "Confirm",
      description: "Delete this?",
    });
  });

  it("closes delete confirm while preserving payload state", () => {
    const { result } = renderHook(() => useLedgerEntriesTabState());

    act(() => {
      result.current.openSourceDocumentDeleteConfirm("doc-1", "Confirm", "Delete this?");
      result.current.closeDeleteConfirm();
    });

    expect(result.current.deleteConfirm.open).toBe(false);
    expect(result.current.deleteConfirm.id).toBe("doc-1");
  });

  it("clears retry source document on close", () => {
    const { result } = renderHook(() => useLedgerEntriesTabState());

    act(() => {
      result.current.setRetrySourceDocument({
        id: "doc-2",
      } as never);
    });
    expect(result.current.retrySourceDocument).not.toBeNull();

    act(() => {
      result.current.closeRetrySourceDocument();
    });

    expect(result.current.retrySourceDocument).toBeNull();
  });
});

