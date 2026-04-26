import { describe, expect, it } from "vitest";
import { parseListLedgerEntriesInput, ledgerStatsQuerySchema } from "@/modules/ledger/contract-schemas";
import { sourceDocumentCollectionInputSchema } from "@/modules/source-document/contract-schemas";

describe("search param validation", () => {
  it("accepts search in listLedgerEntriesInputSchema", () => {
    const result = parseListLedgerEntriesInput({ search: "coffee" });
    expect(result.search).toBe("coffee");
  });

  it("rejects search longer than 200 chars", () => {
    expect(() => parseListLedgerEntriesInput({ search: "a".repeat(201) })).toThrow("Validation failed");
  });

  it("accepts search in sourceDocumentCollectionInputSchema", () => {
    const result = sourceDocumentCollectionInputSchema.parse({ search: "receipt", limit: 100 });
    expect(result.search).toBe("receipt");
  });

  it("accepts search in ledgerStatsQuerySchema", () => {
    const result = ledgerStatsQuerySchema.parse({ search: "grocery" });
    expect(result.search).toBe("grocery");
  });
});
