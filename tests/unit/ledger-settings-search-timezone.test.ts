import { afterEach, describe, expect, it, vi } from "vitest";
import { parseUpdateLedgerInput } from "@/modules/ledger/contract-schemas";
import { normalizeSearchTerm } from "@/lib/search";
import { periodToDateRange } from "@/lib/period-utils";

describe("ledger settings, search, and time zones", () => {
  afterEach(() => vi.useRealTimers());

  it("accepts automatic and valid IANA time zones and rejects invalid values", () => {
    expect(parseUpdateLedgerInput({ settings: { timeZone: null } }).settings?.timeZone).toBeNull();
    expect(
      parseUpdateLedgerInput({ settings: { timeZone: "America/New_York" } }).settings?.timeZone
    ).toBe("America/New_York");
    expect(() => parseUpdateLedgerInput({ settings: { timeZone: "Mars/Olympus" } })).toThrow(
      "Validation failed"
    );
  });

  it("accepts the optional default-collapse preference", () => {
    expect(
      parseUpdateLedgerInput({ settings: { collapseEntriesDefault: true } }).settings
        ?.collapseEntriesDefault
    ).toBe(true);
    expect(
      parseUpdateLedgerInput({ settings: {} }).settings?.collapseEntriesDefault
    ).toBeUndefined();
  });

  it("normalizes whitespace and caps search terms", () => {
    expect(normalizeSearchTerm("  Coffee\n\tReceipt  ")).toBe("Coffee Receipt");
    expect(normalizeSearchTerm("   ")).toBeUndefined();
    expect(normalizeSearchTerm("x".repeat(150))).toHaveLength(100);
  });

  it("anchors this month in the selected time zone across midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T16:30:00.000Z"));

    expect(periodToDateRange({ period: "thisMonth" }, "Asia/Shanghai")).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    expect(periodToDateRange({ period: "thisMonth" }, "America/New_York")).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });
  });
});
