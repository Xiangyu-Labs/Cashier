import { describe, expect, it } from "vitest";
import { buildCachedEnhancedStats } from "@/modules/workspace/ledger-startup-cache-selectors";
import type {
  SourceDocumentLedgerEntryDto,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";

function entry({
  id,
  amount,
  convertedAmount,
  categoryId = "food",
  categoryName = "Food",
  currency = "USD",
}: {
  id: string;
  amount: string;
  convertedAmount: string | null;
  categoryId?: string | null;
  categoryName?: string;
  currency?: string | null;
}): SourceDocumentLedgerEntryDto {
  return {
    id,
    ledgerId: "ledger",
    categoryId,
    sourceDocumentId: `document-${id}`,
    amount,
    currency,
    itemName: id,
    description: null,
    convertedAmount,
    exchangeRate: convertedAmount == null ? null : "7",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    deletedAt: null,
    category:
      categoryId == null
        ? null
        : {
            id: categoryId,
            ledgerId: "ledger",
            name: categoryName,
            description: null,
            icon: "utensils",
            sortOrder: 0,
            isEditable: true,
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
            deletedAt: null,
          },
  };
}

function document({
  id,
  date,
  entries,
  entryDate = date,
  status = "completed",
}: {
  id: string;
  date: string;
  entries: SourceDocumentLedgerEntryDto[];
  entryDate?: string | null;
  status?: SourceDocumentListItemDto["status"];
}): SourceDocumentListItemDto {
  return {
    id,
    ledgerId: "ledger",
    type: "manual",
    status,
    title: id,
    text: null,
    anomalyReason: null,
    entryDate,
    metadata: {},
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
    deletedAt: null,
    files: [],
    hasImages: false,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: null,
    ledgerEntries: entries,
  };
}

describe("buildCachedEnhancedStats", () => {
  it("aggregates the active projection regardless of document status", () => {
    const result = buildCachedEnhancedStats({
      items: [
        document({
          id: "current-a",
          date: "2026-08-01",
          entries: [entry({ id: "a", amount: "10", convertedAmount: "70" })],
        }),
        document({
          id: "current-b",
          date: "2026-08-02",
          entryDate: null,
          entries: [
            entry({
              id: "b",
              amount: "30",
              convertedAmount: null,
              categoryId: null,
              currency: "CNY",
            }),
          ],
        }),
        document({
          id: "current-c",
          date: "2026-08-03",
          status: "processing",
          entries: [entry({ id: "d", amount: "100", convertedAmount: "700" })],
        }),
        document({
          id: "current-uncategorized",
          date: "2026-08-03",
          entries: [
            entry({
              id: "u",
              amount: "5",
              convertedAmount: "5",
              categoryId: null,
              currency: "CNY",
            }),
          ],
        }),
        document({
          id: "previous",
          date: "2026-07-01",
          entries: [entry({ id: "c", amount: "5", convertedAmount: "35" })],
        }),
      ],
      queryRange: { from: "2026-08-01", to: "2026-08-31" },
      compareRange: { from: "2026-07-01", to: "2026-07-31" },
      mainCurrency: "CNY",
      uncategorizedLabel: "Uncategorized",
    });

    expect(result.summary).toEqual({
      total: "775",
      currency: "CNY",
      trend: { percent: (740 / 35) * 100, amount: "740" },
      dailyAverage: 775 / 31,
      comparison: {
        mode: "same_period",
        from: "2026-07-01",
        to: "2026-07-31",
        previousTotal: "35",
        amountDelta: "740",
        percent: (740 / 35) * 100,
      },
    });
    expect(result.unconvertedCount).toBe(1); // current-b entry missing a rate
    expect(result.categories).toHaveLength(2);
    expect(result.categories[0]).toMatchObject({
      id: "food",
      name: "Food",
      totalConverted: "770",
      count: 2,
      trend: { amount: "735", percent: 2100 },
    });
    expect(result.categories[0]?.percent).toBeCloseTo((770 / 775) * 100, 5);
    expect(result.categories[1]).toMatchObject({
      id: null,
      name: "Uncategorized",
      totalConverted: "5",
      count: 1,
    });
    expect(result.categories[1]?.percent).toBeCloseTo((5 / 775) * 100, 5);
    expect(result.chart).toEqual([
      { date: "2026-08-01", total: 70 },
      { date: "2026-08-03", total: 705 },
    ]);
    expect(result.heatmap.days).toEqual([
      { date: "2026-08-01", totalAmount: 70, entryCount: 1, currencies: ["USD"] },
      { date: "2026-08-03", totalAmount: 705, entryCount: 2, currencies: ["USD", "CNY"] },
    ]);
    expect(result.heatmap.stats).toEqual({
      minAmount: 70,
      maxAmount: 705,
      avgAmount: (70 + 705) / 2,
      p80Amount: 705,
    });
  });

  it("propagates the requested comparison mode and compare range", () => {
    const result = buildCachedEnhancedStats({
      items: [
        document({
          id: "current-a",
          date: "2026-08-01",
          entries: [entry({ id: "a", amount: "10", convertedAmount: "70" })],
        }),
      ],
      queryRange: { from: "2026-08-01", to: "2026-08-31" },
      compareRange: { from: "2026-07-01", to: "2026-07-31" },
      mainCurrency: "CNY",
      uncategorizedLabel: "Uncategorized",
      comparisonMode: "full_period",
    });

    expect(result.summary.comparison).toMatchObject({
      mode: "full_period",
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });
});
