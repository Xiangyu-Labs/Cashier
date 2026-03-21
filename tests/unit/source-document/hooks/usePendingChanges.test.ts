import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePendingChanges } from "@/modules/source-document/hooks";
import type { LedgerEntryDto as LedgerEntry } from "@/modules/ledger/contracts";
import type { SourceDocumentDto as SourceDocument } from "@/modules/source-document/contracts";

describe("usePendingChanges", () => {
  const mockSourceDoc = {
    id: "doc-1",
    title: "Original Title",
    entryDate: "2024-01-15",
  } as SourceDocument;

  const mockEntries = [
    { id: "entry-1", itemName: "Item 1", amount: "100", currency: "CNY" },
  ] as LedgerEntry[];

  it("should track source doc changes", () => {
    const { result } = renderHook(() =>
      usePendingChanges({ sourceDocument: mockSourceDoc, ledgerEntries: mockEntries })
    );

    act(() => {
      result.current.handleSourceDocChange({ title: "New Title" });
    });

    expect(result.current.pendingChanges.sourceDoc.title).toBe("New Title");
    expect(result.current.hasPendingChanges).toBe(true);
  });

  it("should not track unchanged values", () => {
    const { result } = renderHook(() =>
      usePendingChanges({ sourceDocument: mockSourceDoc, ledgerEntries: mockEntries })
    );

    act(() => {
      result.current.handleSourceDocChange({ title: "Original Title" });
    });

    expect(result.current.pendingChanges.sourceDoc.title).toBeUndefined();
    expect(result.current.hasPendingChanges).toBe(false);
  });

  it("should discard all changes", () => {
    const { result } = renderHook(() =>
      usePendingChanges({ sourceDocument: mockSourceDoc, ledgerEntries: mockEntries })
    );

    act(() => {
      result.current.handleSourceDocChange({ title: "New Title" });
    });

    act(() => {
      result.current.discardAllChanges();
    });

    expect(result.current.hasPendingChanges).toBe(false);
    expect(Object.keys(result.current.pendingChanges.sourceDoc)).toHaveLength(0);
  });

  it("should track entry changes", () => {
    const { result } = renderHook(() =>
      usePendingChanges({ sourceDocument: mockSourceDoc, ledgerEntries: mockEntries })
    );

    act(() => {
      result.current.handleEntryChange("entry-1", { itemName: "Updated Item" });
    });

    const changedEntry = result.current.pendingChanges.entries["entry-1"];
    expect(changedEntry).toBeDefined();
    if (changedEntry == null) {
      throw new Error("Expected pending change entry");
    }
    expect(changedEntry.itemName).toBe("Updated Item");
    expect(result.current.hasPendingChanges).toBe(true);
  });

  it("should count pending changes correctly", () => {
    const { result } = renderHook(() =>
      usePendingChanges({ sourceDocument: mockSourceDoc, ledgerEntries: mockEntries })
    );

    act(() => {
      result.current.handleSourceDocChange({ title: "New Title" });
    });

    act(() => {
      result.current.handleEntryChange("entry-1", { itemName: "Updated Item", amount: "200" });
    });

    expect(result.current.pendingChangesCount).toBe(3); // 1 source doc + 2 entry fields
  });

  it("should reset changes", () => {
    const { result } = renderHook(() =>
      usePendingChanges({ sourceDocument: mockSourceDoc, ledgerEntries: mockEntries })
    );

    act(() => {
      result.current.handleSourceDocChange({ title: "New Title" });
    });

    act(() => {
      result.current.resetChanges();
    });

    expect(result.current.hasPendingChanges).toBe(false);
  });
});
