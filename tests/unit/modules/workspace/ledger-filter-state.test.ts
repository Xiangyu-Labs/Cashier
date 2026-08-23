import { describe, expect, it } from "vitest";
import {
  buildLedgerEntryFilters,
  buildLedgerFilterKey,
  splitLedgerFilterChange,
  STREAM_STATUS_PRESETS,
  STREAM_STATUS_PRESET_VALUES,
} from "@/modules/workspace/ledger-filter-state";

describe("ledger-filter-state", () => {
  it("derives entry filters and filterKey from period + advanced filters", () => {
    const filters = buildLedgerEntryFilters(
      { period: "custom", startDate: "2026-03-01", endDate: "2026-03-31" },
      { categoryId: "cat-1", minAmount: "20", maxAmount: "100" }
    );

    expect(filters.categoryId).toBe("cat-1");
    expect(buildLedgerFilterKey(filters)).toBe("cat:cat-1|min:20|max:100");
  });

  it("includes statuses from advanced filters in entry filters", () => {
    const filters = buildLedgerEntryFilters(
      { period: "thisMonth" },
      { statuses: ["failed", "anomaly"] }
    );

    expect(filters.statuses).toEqual(["failed", "anomaly"]);
  });

  it("omits statuses from entry filters when advanced filters has no statuses", () => {
    const filters = buildLedgerEntryFilters({ period: "thisMonth" }, { categoryId: "cat-1" });

    expect(filters.statuses).toBeUndefined();
  });

  it("splits a filter edit into period and advanced updates", () => {
    const result = splitLedgerFilterChange({
      currentPeriod: { period: "thisMonth" },
      currentFilters: {},
      nextFilters: {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
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

  it("splits statuses change into advanced filter update without period change", () => {
    const result = splitLedgerFilterChange({
      currentPeriod: { period: "thisMonth" },
      currentFilters: {},
      nextFilters: {
        statuses: ["processing", "failed"],
      },
    });

    expect(result.periodUpdate).toBeUndefined();
    expect(result.advancedFilterUpdate).toEqual({
      statuses: ["processing", "failed"],
    });
  });

  it("clears statuses through advanced filter update", () => {
    const result = splitLedgerFilterChange({
      currentPeriod: { period: "thisMonth" },
      currentFilters: { statuses: ["failed"] },
      nextFilters: {
        statuses: [],
      },
    });

    expect(result.periodUpdate).toBeUndefined();
    expect(result.advancedFilterUpdate).toEqual({
      statuses: [],
    });
  });

  it("preserves the all-time period when date fields are cleared", () => {
    const result = splitLedgerFilterChange({
      currentPeriod: { period: "custom", startDate: "2026-01-01", endDate: "2026-01-31" },
      currentFilters: { startDate: "2026-01-01", endDate: "2026-01-31" },
      nextFilters: {},
      requestedPeriod: "all",
    });

    expect(result.periodUpdate).toEqual({ period: "all" });
  });

  describe("STREAM_STATUS_PRESETS", () => {
    it("defines the attention, duplicate, and in-progress presets", () => {
      expect(STREAM_STATUS_PRESETS).toEqual([
        "needs_attention",
        "possible_duplicates",
        "in_progress",
      ]);
    });

    it("needs_attention includes candidate_pending, duplicate_pending, anomaly, and failed", () => {
      expect(STREAM_STATUS_PRESET_VALUES.needs_attention).toEqual([
        "candidate_pending",
        "duplicate_pending",
        "anomaly",
        "failed",
      ]);
    });

    it("in_progress includes processing", () => {
      expect(STREAM_STATUS_PRESET_VALUES.in_progress).toEqual(["processing"]);
    });

    it("possible_duplicates includes only duplicate-pending documents", () => {
      expect(STREAM_STATUS_PRESET_VALUES.possible_duplicates).toEqual(["duplicate_pending"]);
    });
  });
});
