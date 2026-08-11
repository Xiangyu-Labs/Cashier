import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";
import { useLedgerHistorySync } from "@/modules/workspace/hooks/useLedgerHistorySync";

const ledgerId = "ledger-1";
const detailId = "entry-1";
const detailSearch = `detailType=ledger-entry&detailId=${detailId}`;
const guardKey = `ledger-entry-detail:${ledgerId}:${detailId}`;

describe("useLedgerHistorySync", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", `/ledger/${ledgerId}?${detailSearch}`);
    useModalStackStore.getState().closeAll();
    useUnsavedChangesStore.setState({
      dirtyKeys: new Set(),
      leaveGuards: new Map(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
    useModalStackStore.getState().closeAll();
    useUnsavedChangesStore.setState({
      dirtyKeys: new Set(),
      leaveGuards: new Map(),
    });
  });

  it("restores a dirty detail before prompting and continues back only after approval", async () => {
    let continueNavigation: (() => void) | null = null;
    const requestLeave = vi.fn((continuation: () => void) => {
      continueNavigation = continuation;
    });
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});

    useUnsavedChangesStore.getState().registerLeaveGuard(guardKey, { requestLeave });

    renderHook(() =>
      useLedgerHistorySync({
        pathname: `/ledger/${ledgerId}`,
        searchParams: new URLSearchParams(detailSearch),
        legacyScope: "stream",
        ledgerId,
      })
    );

    await waitFor(() =>
      expect(useModalStackStore.getState().stack).toEqual([
        { type: "ledger-entry", id: detailId, ledgerId },
      ])
    );

    act(() => {
      window.history.replaceState({}, "", `/ledger/${ledgerId}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(go).toHaveBeenCalledWith(1);
    expect(requestLeave).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();

    act(() => {
      window.history.replaceState({}, "", `/ledger/${ledgerId}?${detailSearch}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(requestLeave).toHaveBeenCalledTimes(1);
    expect(continueNavigation).not.toBeNull();
    expect(back).not.toHaveBeenCalled();

    act(() => {
      continueNavigation?.();
    });

    expect(back).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(go).toHaveBeenCalledTimes(1);
    expect(requestLeave).toHaveBeenCalledTimes(1);
  });
});
