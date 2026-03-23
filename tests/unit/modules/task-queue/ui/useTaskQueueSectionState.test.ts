import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTaskQueueSectionState } from "@/modules/task-queue/ui/useTaskQueueSectionState";

describe("useTaskQueueSectionState", () => {
  it("starts with completed collapsed and updates each section independently", () => {
    const { result } = renderHook(() => useTaskQueueSectionState());

    expect(result.current.isPendingCollapsed).toBe(false);
    expect(result.current.isRunningCollapsed).toBe(false);
    expect(result.current.isFailedCollapsed).toBe(false);
    expect(result.current.isAnomalyCollapsed).toBe(false);
    expect(result.current.isCompletedCollapsed).toBe(true);

    act(() => {
      result.current.setIsPendingCollapsed(true);
      result.current.setIsCompletedCollapsed(false);
      result.current.setIsAnomalyCollapsed(true);
    });

    expect(result.current.isPendingCollapsed).toBe(true);
    expect(result.current.isRunningCollapsed).toBe(false);
    expect(result.current.isFailedCollapsed).toBe(false);
    expect(result.current.isAnomalyCollapsed).toBe(true);
    expect(result.current.isCompletedCollapsed).toBe(false);
  });
});
