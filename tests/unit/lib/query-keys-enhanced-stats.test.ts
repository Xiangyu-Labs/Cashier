import { describe, expect, it } from "vitest";
import { queryKeys } from "@/lib/query-keys";

describe("queryKeys enhanced stats and source documents", () => {
  it("builds enhanced stats key with date range and currency dimensions", () => {
    expect(
      queryKeys.enhancedStats("ledger-1", {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        compareStartDate: "2026-02-01",
        compareEndDate: "2026-02-28",
        rangeType: "month",
        comparisonMode: "same_period",
        mainCurrency: "USD",
      })
    ).toEqual([
      "enhanced-stats",
      "ledger-1",
      "2026-03-01",
      "2026-03-31",
      "2026-02-01",
      "2026-02-28",
      "month",
      "same_period",
      "USD",
    ]);
  });

  it("builds source document counts key", () => {
    expect(queryKeys.sourceDocumentCounts("ledger-1")).toEqual([
      "sourceDocuments",
      "ledger-1",
      "counts",
    ]);
  });

  it("builds source document stream key with filters", () => {
    expect(
      queryKeys.sourceDocumentStream("ledger-1", {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        minAmount: "20",
        maxAmount: "100",
      })
    ).toEqual([
      "sourceDocuments",
      "ledger-1",
      "stream",
      "2026-03-01",
      "2026-03-31",
      20,
      100,
      null,
      null,
    ]);
  });

  it("keeps stable positions when enhanced stats dimensions are omitted", () => {
    expect(queryKeys.enhancedStats("ledger-1")).toEqual([
      "enhanced-stats",
      "ledger-1",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});
