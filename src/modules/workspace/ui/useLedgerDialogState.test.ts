import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLedgerDialogState } from "./useLedgerDialogState";

describe("useLedgerDialogState", () => {
  it("defaults to closed input, ai mode, and closed pending modal", () => {
    const { result } = renderHook(() => useLedgerDialogState());

    expect(result.current.isInputOpen).toBe(false);
    expect(result.current.inputMode).toBe("ai");
    expect(result.current.isPendingOpen).toBe(false);
  });

  it("resets input mode back to ai when dialog closes", () => {
    const { result } = renderHook(() => useLedgerDialogState());

    act(() => {
      result.current.setInputMode("quick");
      result.current.handleInputDialogChange(false);
    });

    expect(result.current.isInputOpen).toBe(false);
    expect(result.current.inputMode).toBe("ai");
  });

  it("keeps current mode when opening dialog", () => {
    const { result } = renderHook(() => useLedgerDialogState());

    act(() => {
      result.current.setInputMode("quick");
      result.current.handleInputDialogChange(true);
    });

    expect(result.current.isInputOpen).toBe(true);
    expect(result.current.inputMode).toBe("quick");
  });
});

