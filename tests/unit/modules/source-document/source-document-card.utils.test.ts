import { describe, expect, it } from "vitest";

import type { EntryCategory, LedgerEntry } from "@/modules/ledger/contracts";
import { buildSourceDocumentCardTotals } from "@/modules/source-document/ui/source-document-card.utils";

const defaultCategory: EntryCategory = {
  id: "cat-food",
  ledgerId: "ledger-1",
  name: "餐饮",
  description: null,
  icon: "Utensils",
  sortOrder: 1,
  isEditable: true,
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  deletedAt: null,
};

function createEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "entry-1",
    ledgerId: "ledger-1",
    categoryId: defaultCategory.id,
    category: defaultCategory,
    itemName: "默认条目",
    amount: "12.00",
    currency: "CNY",
    convertedAmount: null,
    exchangeRate: null,
    description: null,
    sourceDocumentId: "doc-1",
    sourceDocument: null,
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    deletedAt: null,
    ...overrides,
  };
}

describe("source-document-card utils", () => {
  it("builds totals with converted amounts and falls back to main-currency entry amounts", () => {
    const totals = buildSourceDocumentCardTotals(
      [
        createEntry({
          id: "usd-entry",
          amount: "10.00",
          currency: "USD",
          convertedAmount: "70.00",
        }),
        createEntry({
          id: "cny-entry",
          amount: "20.00",
          currency: "CNY",
          convertedAmount: null,
        }),
      ],
      "CNY"
    );

    expect(totals.subtotalsByCurrency).toEqual({
      USD: 10,
      CNY: 20,
    });
    expect(totals.totalInMainCurrency).toBe(90);
    expect(totals.breakdownData).toEqual([
      {
        currency: "USD",
        amount: 10,
        convertedAmount: 70,
      },
      {
        currency: "CNY",
        amount: 20,
        convertedAmount: 20,
      },
    ]);
  });
});
