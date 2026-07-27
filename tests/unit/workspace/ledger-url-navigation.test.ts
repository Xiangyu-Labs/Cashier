import { describe, expect, it, vi } from "vitest";
import { replaceLedgerUrl } from "@/modules/workspace/ledger-url-navigation";

describe("ledger-url-navigation", () => {
  it("replaceLedgerUrl updates history and returns the built url", () => {
    const historySpy = vi.spyOn(window.history, "replaceState");
    const params = new URLSearchParams("tab=details&period=thisMonth");

    const url = replaceLedgerUrl("/ledgers/ledger-1", params);

    expect(url).toBe("/ledgers/ledger-1?tab=details&period=thisMonth");
    expect(historySpy).toHaveBeenCalledWith(null, "", url);
  });
});
