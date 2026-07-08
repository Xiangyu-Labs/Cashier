import { describe, expect, it } from "vitest";
import {
  ledgerStatsQuerySchema,
  parseListLedgerEntriesInput,
} from "@/modules/ledger/contract-schemas";
import { sourceDocumentCollectionInputSchema } from "@/modules/source-document/contract-schemas";

describe("retired search param validation", () => {
  it("rejects search in listLedgerEntriesInputSchema", () => {
    expect(() => parseListLedgerEntriesInput({ search: "coffee" })).toThrow("Validation failed");
  });

  it("rejects search in sourceDocumentCollectionInputSchema", () => {
    expect(() =>
      sourceDocumentCollectionInputSchema.parse({ search: "receipt", limit: 100 })
    ).toThrow();
  });

  it("rejects search in ledgerStatsQuerySchema", () => {
    expect(() => ledgerStatsQuerySchema.parse({ search: "grocery" })).toThrow();
  });

  it("continues to accept supported filter params", () => {
    const entries = parseListLedgerEntriesInput({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      categoryId: "11111111-1111-4111-8111-111111111111",
      currency: "USD",
      minAmount: "10",
      maxAmount: "50",
      limit: "20",
    });

    expect(entries).toMatchObject({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      categoryId: "11111111-1111-4111-8111-111111111111",
      currency: "USD",
      minAmount: 10,
      maxAmount: 50,
      limit: 20,
    });

    expect(
      sourceDocumentCollectionInputSchema.parse({
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        minAmount: "10",
        maxAmount: "50",
        limit: 100,
      })
    ).toMatchObject({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      minAmount: 10,
      maxAmount: 50,
      limit: 100,
    });

    expect(
      ledgerStatsQuerySchema.parse({
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        categoryId: "11111111-1111-4111-8111-111111111111",
        currency: "USD",
      })
    ).toMatchObject({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      categoryId: "11111111-1111-4111-8111-111111111111",
      currency: "USD",
    });
  });
});
