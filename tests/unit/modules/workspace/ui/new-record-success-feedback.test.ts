import { beforeEach, describe, expect, it, vi } from "vitest";
import { useModalStackStore } from "@/lib/store/modal-stack";

const toastSuccessMock = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock },
}));

import {
  shouldWarnNewRecordMayBeHidden,
  showNewRecordSuccessFeedback,
} from "@/modules/workspace/ui/new-record-success-feedback";

const messages = {
  aiSuccess: "AI saved",
  quickSuccess: "Quick saved",
  savedMayBeHidden: "Saved but hidden",
  viewRecord: "View record",
};

describe("new record success feedback", () => {
  beforeEach(() => {
    toastSuccessMock.mockReset();
    useModalStackStore.getState().closeAll();
    window.history.replaceState(
      { next: "preserved" },
      "",
      "/ledger-1?tab=stats&streamSearch=lunch"
    );
  });

  it("shows a single action toast and preserves filters when opening the record", () => {
    showNewRecordSuccessFeedback({
      mode: "ai",
      ledgerId: "ledger-1",
      result: { sourceDocumentId: "source-1", entryDate: "2026-07-17" },
      activeTab: "stats",
      committedFilters: {},
      messages,
    });

    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Saved but hidden",
      expect.objectContaining({
        action: expect.objectContaining({ label: "View record" }),
      })
    );

    const options = toastSuccessMock.mock.calls[0]?.[1] as {
      action: { onClick: () => void };
    };
    options.action.onClick();

    const params = new URLSearchParams(window.location.search);
    expect(params.get("tab")).toBe("stats");
    expect(params.get("streamSearch")).toBe("lunch");
    expect(params.get("detailType")).toBe("source-document");
    expect(params.get("detailId")).toBe("source-1");
    expect(window.history.state).toMatchObject({
      next: "preserved",
      cashier: { ledgerNavigation: true, kind: "detail" },
    });
    expect(useModalStackStore.getState().stack).toEqual([
      { type: "source-document", id: "source-1", ledgerId: "ledger-1" },
    ]);
  });

  it("uses the mode-specific generic toast for an unfiltered in-range Stream record", () => {
    showNewRecordSuccessFeedback({
      mode: "quick",
      ledgerId: "ledger-1",
      result: { sourceDocumentId: "source-2", entryDate: "2026-07-17" },
      activeTab: "stream",
      committedFilters: {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      },
      messages,
    });

    expect(toastSuccessMock).toHaveBeenCalledOnce();
    expect(toastSuccessMock).toHaveBeenCalledWith("Quick saved");
  });

  it("warns for narrowing filters and dates outside the committed range", () => {
    expect(
      shouldWarnNewRecordMayBeHidden("stream", { statuses: ["processing"] }, "2026-07-17")
    ).toBe(true);
    expect(
      shouldWarnNewRecordMayBeHidden(
        "stream",
        { startDate: "2026-07-18", endDate: "2026-07-31" },
        "2026-07-17"
      )
    ).toBe(true);
  });
});
