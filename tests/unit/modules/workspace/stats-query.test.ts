import { describe, expect, it } from "vitest";
import { buildStatsQueryDescriptor } from "@/modules/workspace/stats-query";
import { getStatsInitialQueryState } from "@/modules/workspace/initial-query-state";

describe("buildStatsQueryDescriptor", () => {
  it("builds the full input and the nine-dimension query key", () => {
    const state = getStatsInitialQueryState(new Date(2026, 7, 6));

    const descriptor = buildStatsQueryDescriptor({
      ledgerId: "ledger-1",
      state,
      mainCurrency: "USD",
    });

    expect(descriptor.queryKey).toEqual([
      "enhanced-stats",
      "ledger-1",
      state.startDateStr,
      state.endDateStr,
      state.prevDateStartStr,
      state.prevDateEndStr,
      "month",
      "same_period",
      "USD",
    ]);
    expect(descriptor.input).toEqual({
      ledgerId: "ledger-1",
      queryRange: { from: state.startDateStr, to: state.endDateStr },
      compareRange: { from: state.prevDateStartStr, to: state.prevDateEndStr },
      comparisonMode: "same_period",
    });
  });

  it("propagates the full-period mode from the stats state", () => {
    const state = getStatsInitialQueryState(new Date(2026, 7, 6), "year", {
      currentPeriod: false,
    });

    const descriptor = buildStatsQueryDescriptor({
      ledgerId: "ledger-1",
      state,
      mainCurrency: "CNY",
    });

    expect(descriptor.input.comparisonMode).toBe("full_period");
    expect(descriptor.queryKey).toContain("full_period");
    expect(descriptor.queryKey).toContain("year");
  });
});
