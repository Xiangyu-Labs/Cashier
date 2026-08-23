import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { buildSourceDocumentDetailViewModel } from "@/modules/source-document/ui/source-document-detail-view-model";

const entry: LedgerEntry = {
  id: "entry-1",
  ledgerId: "ledger-1",
  categoryId: null,
  sourceDocumentId: "document-1",
  amount: "10",
  currency: "USD",
  itemName: "Coffee",
  description: null,
  convertedAmount: "70",
  exchangeRate: "7",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  deletedAt: null,
};

function build(entryDate: string, entries: Record<string, { currency?: string }> = {}) {
  return buildSourceDocumentDetailViewModel({
    ledgerEntries: [entry],
    pendingChanges: { entries },
    mainCurrency: "CNY",
    entryDate,
    originalEntryDate: "2026-08-01",
  });
}

describe("source document detail conversion view model", () => {
  it("reuses the stored conversion only while currency and date identity match", () => {
    expect(build("2026-08-01")).toMatchObject({
      totalInMainCurrency: 70,
      unconvertedCount: 0,
    });
  });

  it("excludes a foreign entry when its date changes and no new rate exists", () => {
    const result = build("2026-08-02");
    expect(result.displayEntries[0]).toMatchObject({ exchangeRate: null, convertedAmount: null });
    expect(result.totalInMainCurrency).toBe(0);
    expect(result.unconvertedCount).toBe(1);
  });

  it("excludes a foreign entry when its edited currency changes", () => {
    const result = build("2026-08-01", { "entry-1": { currency: "EUR" } });
    expect(result.displayEntries[0]).toMatchObject({ currency: "EUR", convertedAmount: null });
    expect(result.unconvertedCount).toBe(1);
  });
});
