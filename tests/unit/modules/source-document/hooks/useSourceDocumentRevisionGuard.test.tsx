import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSourceDocumentRevisionGuard } from "@/modules/source-document/hooks/useSourceDocumentRevisionGuard";

describe("useSourceDocumentRevisionGuard", () => {
  it("holds the version from entering edit mode until the edit ends", () => {
    const { result, rerender } = renderHook(useSourceDocumentRevisionGuard, {
      initialProps: { isEditing: false, hasPendingChanges: false, version: 1 },
    });
    rerender({ isEditing: true, hasPendingChanges: false, version: 1 });
    rerender({ isEditing: true, hasPendingChanges: false, version: 2 });
    expect(result.current.baseVersionRef.current).toBe(1);
    rerender({ isEditing: true, hasPendingChanges: true, version: 2 });
    expect(result.current.hasVersionConflict).toBe(true);
    rerender({ isEditing: false, hasPendingChanges: false, version: 2 });
    expect(result.current.baseVersionRef.current).toBeNull();
    rerender({ isEditing: true, hasPendingChanges: false, version: 2 });
    expect(result.current.baseVersionRef.current).toBe(2);
  });
});
