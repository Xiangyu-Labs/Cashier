import { describe, expect, it } from "vitest";
import {
  buildLedgerEntryFilters,
  buildLedgerFilterKey,
  splitLedgerFilterChange,
} from "@/modules/workspace/ledger-filter-state";

describe("ledger-filter-state", () => {
  it("derives entry filters and filterKey from period + advanced filters", () => {
    const filters = buildLedgerEntryFilters(
      { period: "custom", startDate: "2026-03-01", endDate: "2026-03-31" },
      { categoryId: "cat-1", minAmount: 20, maxAmount: 100 }
    );

    expect(filters.categoryId).toBe("cat-1");
    expect(buildLedgerFilterKey(filters)).toBe("cat:cat-1|min:20|max:100");
  });

  it("splits a filter edit into period and advanced updates", () => {
    const result = splitLedgerFilterChange({
      currentPeriod: { period: "thisMonth" },
      currentFilters: {},
      nextFilters: {
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-03-31T00:00:00.000Z"),
        currency: "USD",
      },
    });

    expect(result.periodUpdate).toEqual({
      period: "custom",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });
    expect(result.advancedFilterUpdate).toEqual({
      currency: "USD",
    });
  });

  it("includes search in filterKey", () => {
    const filters = buildLedgerEntryFilters({ period: "thisMonth" }, { search: "coffee" });
    expect(buildLedgerFilterKey(filters)).toBe("search:coffee");
  });

  it("splits search into advanced filter update", () => {
    const result = splitLedgerFilterChange({
      currentPeriod: { period: "thisMonth" },
      currentFilters: {},
      nextFilters: { search: "grocery" },
    });
    expect(result.advancedFilterUpdate.search).toBe("grocery");
  });
});
