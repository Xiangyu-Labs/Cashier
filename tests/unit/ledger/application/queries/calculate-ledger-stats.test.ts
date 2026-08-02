import { describe, expect, it, vi } from "vitest";

const calculateLedgerEntryStatsMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/ledger/application/queries/calculate-ledger-entry-stats", () => ({
  calculateLedgerEntryStats: calculateLedgerEntryStatsMock,
}));

import { calculateLedgerStats as calculateLedgerStatsUseCase } from "@/modules/ledger/application/queries/calculate-ledger-stats";
import type { LedgerReadPort } from "@/modules/ledger/application/ports";

const reads = {} as LedgerReadPort;
const calculateLedgerStats = (
  ledgerId: string,
  startDate?: string,
  endDate?: string,
  mainCurrency?: string,
  filters?: Parameters<typeof calculateLedgerStatsUseCase>[4]
) => calculateLedgerStatsUseCase(ledgerId, startDate, endDate, mainCurrency, filters, reads);

describe("calculateLedgerStats", () => {
  it("passes through only provided filters and main currency", async () => {
    calculateLedgerEntryStatsMock.mockResolvedValueOnce({ total: "ok" });

    const result = await calculateLedgerStats("ledger-1", "2026-03-01", "2026-03-31", "USD", {
      categoryId: "cat-1",
      currency: "CNY",
      minAmount: 10,
      maxAmount: 99,
    });

    expect(result).toEqual({ total: "ok" });
    expect(calculateLedgerEntryStatsMock).toHaveBeenCalledWith(
      {
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
      },
      reads
    );
  });

  it("normalizes the uncategorized sentinel to an uncategorized only filter", async () => {
    calculateLedgerEntryStatsMock.mockResolvedValueOnce({ total: "sentinel" });

    const result = await calculateLedgerStats("ledger-3", undefined, undefined, undefined, {
      categoryId: "__uncategorized__",
      currency: "USD",
    });

    expect(result).toEqual({ total: "sentinel" });
    expect(calculateLedgerEntryStatsMock).toHaveBeenCalledWith(
      {
        ledgerId: "ledger-3",
        filters: { currency: "USD", uncategorizedOnly: true },
      },
      reads
    );
  });

  it("keeps an empty filters object when no optional values are provided", async () => {
    calculateLedgerEntryStatsMock.mockResolvedValueOnce({ total: "base" });

    await calculateLedgerStats("ledger-2");

    expect(calculateLedgerEntryStatsMock).toHaveBeenCalledWith(
      { ledgerId: "ledger-2", filters: {} },
      reads
    );
  });
});
