import { afterEach, describe, expect, it, vi } from "vitest";
import { pushLedgerUrl, replaceLedgerUrl } from "@/modules/workspace/ledger-url-navigation";

describe("ledger-url-navigation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("replaceLedgerUrl updates history and returns the built url", () => {
    const historySpy = vi.spyOn(window.history, "replaceState");
    const params = new URLSearchParams("tab=details&period=thisMonth");

    const url = replaceLedgerUrl("/ledgers/ledger-1", params, "en");

    expect(url).toBe("/en/ledgers/ledger-1?tab=details&period=thisMonth");
    expect(historySpy).toHaveBeenCalledWith(
      { cashier: { ledgerNavigation: true, kind: "filter", sequence: 0 } },
      "",
      url
    );
  });

  it("pushLedgerUrl excludes Next.js internal state while preserving custom metadata", () => {
    window.history.replaceState(
      {
        __NA: true,
        _N: true,
        __PRIVATE_NEXTJS_INTERNALS_TREE: ["next-router-tree"],
        unrelatedCustomState: "keep",
        cashier: { ledgerNavigation: true, kind: "filter", sequence: 0 },
      },
      "",
      "/ledgers/ledger-1?tab=stream"
    );
    const historySpy = vi.spyOn(window.history, "pushState");

    const url = pushLedgerUrl("/ledgers/ledger-1", new URLSearchParams("tab=details"), "zh", "tab");

    expect(url).toBe("/zh/ledgers/ledger-1?tab=details");

    expect(historySpy).toHaveBeenCalledWith(
      {
        unrelatedCustomState: "keep",
        cashier: { ledgerNavigation: true, kind: "tab", sequence: 1 },
      },
      "",
      url
    );
  });

  it("replaceLedgerUrl excludes Next.js internal state and preserves Cashier history metadata", () => {
    window.history.replaceState(
      {
        __NA: true,
        __PRIVATE_NEXTJS_INTERNALS_TREE: ["next-router-tree"],
        cashier: { ledgerNavigation: true, kind: "detail", sequence: 4 },
        unrelatedCustomState: "keep",
      },
      "",
      "/ledgers/ledger-1?tab=details"
    );
    const historySpy = vi.spyOn(window.history, "replaceState");

    const url = replaceLedgerUrl(
      "/ledgers/ledger-1",
      new URLSearchParams("tab=details&detailId=document-1"),
      "en"
    );

    expect(historySpy).toHaveBeenCalledWith(
      {
        cashier: { ledgerNavigation: true, kind: "filter", sequence: 4 },
        unrelatedCustomState: "keep",
      },
      "",
      url
    );
  });

  it("replaces an existing locale prefix instead of duplicating it", () => {
    const url = replaceLedgerUrl("/zh/ledgers/ledger-1", new URLSearchParams(), "en");

    expect(url).toBe("/en/ledgers/ledger-1");
  });

  it("falls back to the default locale for an unsupported locale", () => {
    const url = replaceLedgerUrl("/ledgers/ledger-1", new URLSearchParams(), "fr");

    expect(url).toBe("/zh/ledgers/ledger-1");
  });
});
