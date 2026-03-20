import { describe, expect, it, vi } from "vitest";

const calculateLedgerEntryStatsMock = vi.hoisted(() => vi.fn());

vi.mock("./calculate-ledger-entry-stats", () => ({
  calculateLedgerEntryStats: calculateLedgerEntryStatsMock,
}));

import { calculateLedgerStats } from "./calculate-ledger-stats";

describe("calculateLedgerStats", () => {
  it("passes through only provided filters and main currency", async () => {
    calculateLedgerEntryStatsMock.mockResolvedValueOnce({ total: "ok" });

    const result = await calculateLedgerStats(
      "ledger-1",
      "2026-03-01",
      "2026-03-31",
      "USD",
      {
        categoryId: "cat-1",
        currency: "CNY",
        minAmount: 10,
        maxAmount: 99,
      }
    );

    expect(result).toEqual({ total: "ok" });
    expect(calculateLedgerEntryStatsMock).toHaveBeenCalledWith({
      ledgerId: "ledger-1",
      mainCurrency: "USD",
      filters: {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        categoryId: "cat-1",
        currency: "CNY",
        minAmount: 10,
        maxAmount: 99,
      },
    });
  });

  it("keeps an empty filters object when no optional values are provided", async () => {
    calculateLedgerEntryStatsMock.mockResolvedValueOnce({ total: "base" });

    await calculateLedgerStats("ledger-2");

    expect(calculateLedgerEntryStatsMock).toHaveBeenCalledWith({
      ledgerId: "ledger-2",
      filters: {},
    });
  });
});
