import { describe, expect, it } from "vitest";
import { isLedgerTab, parseLedgerTab } from "@/modules/workspace/tabs";

describe("ledger tabs helpers", () => {
  it("parses a valid tab from URLSearchParams", () => {
    expect(parseLedgerTab(new URLSearchParams("tab=stats"))).toBe("stats");
  });

  it("falls back to stream when tab is missing", () => {
    expect(parseLedgerTab(new URLSearchParams())).toBe("stream");
  });

  it("falls back to stream when tab is invalid", () => {
    expect(parseLedgerTab(new URLSearchParams("tab=invalid"))).toBe("stream");
  });

  it("supports server search params objects", () => {
    expect(parseLedgerTab({ tab: ["details"] })).toBe("details");
  });

  it("validates ledger tab values", () => {
    expect(isLedgerTab("settings")).toBe(true);
    expect(isLedgerTab("invalid")).toBe(false);
  });
});
