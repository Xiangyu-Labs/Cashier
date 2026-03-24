import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { buildSourceDocumentDetailViewModel } from "@/modules/source-document/ui/source-document-detail-view-model";

describe("buildSourceDocumentDetailViewModel", () => {
  it("uses the same edited entry model for subtotals and main-currency total", () => {
    const result = buildSourceDocumentDetailViewModel({
      ledgerEntries: [
        {
          id: "entry-1",
          ledgerId: "ledger-1",
          categoryId: null,
          sourceDocumentId: "doc-1",
          amount: "10.00",
          currency: "USD",
          itemName: "Lunch",
          description: null,
          convertedAmount: "72.00",
          exchangeRate: "7.2",
          createdAt: "2026-03-20T10:00:00.000Z",
          updatedAt: "2026-03-20T11:00:00.000Z",
          deletedAt: null,
          category: null,
        },
      ] as LedgerEntry[],
      pendingChanges: {
        entries: {
          "entry-1": {
            amount: "20.00",
          },
        },
      },
      mainCurrency: "CNY",
    });

    expect(result.displayEntries).toEqual([
      expect.objectContaining({
        id: "entry-1",
        amount: 20,
        currency: "USD",
        convertedAmount: 144,
      }),
    ]);
    expect(result.subtotalsByCurrency).toEqual({ USD: 20 });
    expect(result.totalInMainCurrency).toBe(144);
  });
});
