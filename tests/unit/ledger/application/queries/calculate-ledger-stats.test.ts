import { describe, expect, it, vi } from "vitest";

import { calculateLedgerStats as calculateLedgerStatsUseCase } from "@/modules/ledger/application/queries/calculate-ledger-stats";
import type { LedgerReadPort } from "@/modules/ledger/application/ports";

const calculateStats = vi.fn();
const reads = { calculateStats } as unknown as LedgerReadPort;
const calculateLedgerStats = (
  ledgerId: string,
  query: Parameters<typeof calculateLedgerStatsUseCase>[1] = {}
) => calculateLedgerStatsUseCase(ledgerId, query, reads);

describe("calculateLedgerStats", () => {
  it("passes through only provided filters", async () => {
    calculateStats.mockResolvedValueOnce({ total: "ok" });

    const result = await calculateLedgerStats("ledger-1", {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      categoryId: "cat-1",
      currency: "CNY",
      minAmount: "10",
      maxAmount: "99",
    });

    expect(result).toEqual({ total: "ok" });
    expect(calculateStats).toHaveBeenCalledWith({
      ledgerId: "ledger-1",
      filters: {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        categoryId: "cat-1",
        currency: "CNY",
        minAmount: "10",
        maxAmount: "99",
      },
    });
  });

  it("normalizes the uncategorized sentinel to an uncategorized only filter", async () => {
    calculateStats.mockResolvedValueOnce({ total: "sentinel" });

    const result = await calculateLedgerStats("ledger-3", {
      categoryId: "__uncategorized__",
      currency: "USD",
    });

    expect(result).toEqual({ total: "sentinel" });
    expect(calculateStats).toHaveBeenCalledWith({
      ledgerId: "ledger-3",
      filters: { currency: "USD", uncategorizedOnly: true },
    });
  });

  it("keeps an empty filters object when no optional values are provided", async () => {
    calculateStats.mockResolvedValueOnce({ total: "base" });

    await calculateLedgerStats("ledger-2");

    expect(calculateStats).toHaveBeenCalledWith({ ledgerId: "ledger-2", filters: {} });
  });
});
