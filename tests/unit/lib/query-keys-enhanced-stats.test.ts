import { describe, expect, it } from "vitest";
import { queryKeys } from "@/lib/query-keys";

describe("queryKeys enhanced stats and source documents", () => {
  it("builds enhanced stats key with date range and currency dimensions", () => {
    expect(
      queryKeys.enhancedStats("ledger-1", {
        startDate: "2026-03-01",
        rangeType: "month",
        mainCurrency: "USD",
      })
    ).toEqual(["enhanced-stats", "ledger-1", "2026-03-01", "month", "USD"]);
  });

  it("builds source document all key with amount filters", () => {
    expect(
      queryKeys.sourceDocumentsAll("ledger-1", {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        minAmount: 20,
        maxAmount: 100,
      })
    ).toEqual(["sourceDocuments", "ledger-1", "all", "2026-03-01", "2026-03-31", 20, 100]);
  });

  it("keeps stable positions when enhanced stats dimensions are omitted", () => {
    expect(queryKeys.enhancedStats("ledger-1")).toEqual([
      "enhanced-stats",
      "ledger-1",
      null,
      null,
      null,
    ]);
  });
});
