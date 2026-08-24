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
    window.history.replaceState(
      { cashier: { ledgerNavigation: true, kind: "detail", sequence: 1 } },
      "",
      `/ledger/${ledgerId}?${detailSearch}`
    );
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
        { type: "ledger-entry", id: detailId, ledgerId, returnFocus: null },
      ])
    );

    act(() => {
      const state = { cashier: { ledgerNavigation: true, kind: "filter", sequence: 0 } };
      window.history.replaceState(state, "", `/ledger/${ledgerId}`);
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
    });

    expect(go).toHaveBeenCalledWith(1);
    expect(requestLeave).not.toHaveBeenCalled();

    act(() => {
      const state = { cashier: { ledgerNavigation: true, kind: "detail", sequence: 1 } };
      window.history.replaceState(state, "", `/ledger/${ledgerId}?${detailSearch}`);
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
    });

    expect(requestLeave).toHaveBeenCalledTimes(1);
    expect(continueNavigation).not.toBeNull();

    act(() => {
      continueNavigation?.();
    });

    expect(go).toHaveBeenLastCalledWith(-1);

    act(() => {
      const state = { cashier: { ledgerNavigation: true, kind: "filter", sequence: 0 } };
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
    });

    expect(go).toHaveBeenCalledTimes(2);
    expect(requestLeave).toHaveBeenCalledTimes(1);
  });
});
