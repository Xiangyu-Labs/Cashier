import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";
import { useSettingsLeaveGuard } from "@/modules/ledger/hooks/useSettingsLeaveGuard";

describe("useSettingsLeaveGuard", () => {
  beforeEach(() => {
    useUnsavedChangesStore.setState({ dirtyKeys: new Set(), leaveGuards: new Map() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useUnsavedChangesStore.setState({ dirtyKeys: new Set(), leaveGuards: new Map() });
  });

  it("prompts shared navigation and protects beforeunload while settings are dirty", async () => {
    const { result } = renderHook(() => useSettingsLeaveGuard());
    const continuation = vi.fn();

    act(() => useUnsavedChangesStore.getState().setDirty("settings:bookkeeping", true));
    await waitFor(() =>
      expect(useUnsavedChangesStore.getState().getLeaveGuard("settings-navigation")).not.toBeNull()
    );

    act(() => result.current.attemptLeave(continuation));
    expect(result.current.leaveConfirmOpen).toBe(true);
    expect(continuation).not.toHaveBeenCalled();

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    act(() => result.current.confirmLeave());
    expect(continuation).toHaveBeenCalledOnce();
  });

  it("restores independent-page history before prompting", async () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result } = renderHook(() => useSettingsLeaveGuard({ managePopState: true }));

    act(() => useUnsavedChangesStore.getState().setDirty("settings:appearance", true));
    await waitFor(() =>
      expect(useUnsavedChangesStore.getState().getLeaveGuard("settings-navigation")).not.toBeNull()
    );

    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(go).toHaveBeenCalledWith(1);
    expect(result.current.leaveConfirmOpen).toBe(false);

    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(result.current.leaveConfirmOpen).toBe(true);

    act(() => result.current.confirmLeave());
    expect(back).toHaveBeenCalledOnce();
  });
});
