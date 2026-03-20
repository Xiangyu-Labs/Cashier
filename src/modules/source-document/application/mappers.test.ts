import { describe, expect, it } from "vitest";
import { mapSourceDocumentLedgerEntryDto } from "./mappers";

describe("mapSourceDocumentLedgerEntryDto", () => {
  it("omits category when the relation is absent", () => {
    const dto = mapSourceDocumentLedgerEntryDto({
      id: "entry-1",
      ledgerId: "ledger-1",
      categoryId: null,
      sourceDocumentId: "doc-1",
      amount: "10.00",
      currency: "USD",
      itemName: "Coffee",
      description: null,
      convertedAmount: null,
      exchangeRate: null,
      createdAt: "2026-03-19T12:00:00.000Z",
      updatedAt: "2026-03-19T12:00:00.000Z",
      deletedAt: null,
    });

    expect("category" in dto).toBe(false);
  });
});
