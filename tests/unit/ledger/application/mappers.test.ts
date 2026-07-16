import { describe, expect, it } from "vitest";
import { mapLedgerEntryDto } from "@/application/adapters/sqlite/ledger-reads/mappers";
import type { LedgerEntry } from "@/persistence";

describe("mapLedgerEntryDto", () => {
  it("omits optional relation fields when they are absent", () => {
    const entry: LedgerEntry = {
      id: "entry-1",
      ledgerId: "ledger-1",
      categoryId: null,
      sourceDocumentId: null,
      sourceDocumentRevisionId: null,
      amount: "12.50",
      currency: "USD",
      itemName: "Coffee",
      description: null,
      convertedAmount: "12.50",
      exchangeRate: "1",
      createdAt: new Date("2026-03-19T12:00:00.000Z"),
      updatedAt: new Date("2026-03-19T12:00:00.000Z"),
      deletedAt: null,
    };

    const dto = mapLedgerEntryDto(entry);

    expect("category" in dto).toBe(false);
    expect("sourceDocument" in dto).toBe(false);
  });
});
