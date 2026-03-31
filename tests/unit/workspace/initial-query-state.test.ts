import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATS_RANGE_TYPE,
  buildDetailsFilterKey,
  getDetailsInitialQueryState,
  getStatsInitialQueryState,
} from "@/modules/workspace/initial-query-state";

describe("initial ledger query state helpers", () => {
  it("builds a stable details filter key", () => {
    expect(
      buildDetailsFilterKey({
        categoryId: "cat_1",
        currency: "USD",
        minAmount: 10,
        maxAmount: 50,
      })
    ).toBe("cat:cat_1|cur:USD|min:10|max:50");
  });

  it("returns null filter key when no advanced filters are set", () => {
    expect(buildDetailsFilterKey({})).toBeNull();
  });

  it("derives details query state from period params", () => {
    expect(
      getDetailsInitialQueryState({
        period: "custom",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      })
    ).toEqual({
      startDateStr: "2026-03-01",
      endDateStr: "2026-03-31",
      filterKey: null,
    });
  });

  it("derives month stats query state from the initial date", () => {
    const state = getStatsInitialQueryState(new Date(2026, 2, 18), DEFAULT_STATS_RANGE_TYPE);

    expect(state.rangeType).toBe("month");
    expect(state.startDateStr).toBe("2026-03-01");
    expect(state.endDateStr).toBe("2026-03-31");
    expect(state.prevDateStartStr).toBe("2026-02-01");
    expect(state.prevDateEndStr).toBe("2026-02-28");
  });

  it("derives the previous month correctly for month-end stats dates", () => {
    const state = getStatsInitialQueryState(new Date(2026, 2, 31), DEFAULT_STATS_RANGE_TYPE);

    expect(state.rangeType).toBe("month");
    expect(state.startDateStr).toBe("2026-03-01");
    expect(state.endDateStr).toBe("2026-03-31");
    expect(state.prevDateStartStr).toBe("2026-02-01");
    expect(state.prevDateEndStr).toBe("2026-02-28");
  });
});
