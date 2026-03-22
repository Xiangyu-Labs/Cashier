import { describe, expect, it, vi } from "vitest";
import { replaceAndNavigateLedgerUrl, replaceLedgerUrl } from "../../../src/modules/workspace/ledger-url-navigation";

describe("ledger-url-navigation", () => {
  it("replaceLedgerUrl updates history and returns the built url", () => {
    const historySpy = vi.spyOn(window.history, "replaceState");
    const params = new URLSearchParams("tab=details&period=thisMonth");

    const url = replaceLedgerUrl("/ledgers/ledger-1", params);

    expect(url).toBe("/ledgers/ledger-1?tab=details&period=thisMonth");
    expect(historySpy).toHaveBeenCalledWith(null, "", url);
  });

  it("replaceAndNavigateLedgerUrl updates history and router navigation", () => {
    const historySpy = vi.spyOn(window.history, "replaceState");
    const router = {
      replace: vi.fn(),
    };
    const params = new URLSearchParams("tab=stats");

    const url = replaceAndNavigateLedgerUrl("/ledgers/ledger-1", params, router);

    expect(url).toBe("/ledgers/ledger-1?tab=stats");
    expect(historySpy).toHaveBeenCalledWith(null, "", url);
    expect(router.replace).toHaveBeenCalledWith(url, { scroll: false });
  });
});
