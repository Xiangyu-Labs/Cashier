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
  it("uses the persisted accounting projection and the same effective-date fallback", () => {
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
          id: "previous",
          date: "2026-07-01",
          entries: [entry({ id: "c", amount: "5", convertedAmount: "35" })],
        }),
        document({
          id: "ignored",
          date: "2026-08-03",
          status: "processing",
          entries: [entry({ id: "d", amount: "100", convertedAmount: "700" })],
        }),
      ],
      queryRange: { from: "2026-08-01", to: "2026-08-31" },
      compareRange: { from: "2026-07-01", to: "2026-07-31" },
      mainCurrency: "CNY",
      uncategorizedLabel: "Uncategorized",
      today: "2026-08-02",
    });

    expect(result.summary).toEqual({
      total: "70",
      currency: "CNY",
      trend: { percent: 100, amount: "35" },
      dailyAverage: 35,
      comparison: {
        mode: "same_period",
        from: "2026-08-01",
        to: "2026-08-31",
        previousTotal: "35",
        amountDelta: "35",
        percent: 100,
      },
    });
    expect(result.unconvertedCount).toBe(1);
    expect(result.categories).toMatchObject([
      {
        id: "food",
        name: "Food",
        totalConverted: "70",
        percent: 100,
        count: 1,
        trend: { amount: "35", percent: 100 },
      },
    ]);
    expect(result.chart).toEqual([{ date: "2026-08-01", total: 70 }]);
    expect(result.heatmap.days).toEqual([
      { date: "2026-08-01", totalAmount: 70, entryCount: 1, currencies: ["USD"] },
    ]);
    expect(result.heatmap.stats).toEqual({
      minAmount: 70,
      maxAmount: 70,
      avgAmount: 70,
      p80Amount: 70,
    });
  });
});
