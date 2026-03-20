import { describe, expect, it } from "vitest";
import {
  createSourceDocumentInputSchema,
  listSourceDocumentsInputSchema,
  retrySourceDocumentInputSchema,
} from "@/modules/source-document/contract-schemas";
import {
  ledgerStatsQuerySchema,
  listLedgerEntriesInputSchema,
} from "@/modules/ledger/contract-schemas";

describe("contract schema omission semantics", () => {
  it("omits undefined optional keys in source-document create/retry schemas", () => {
    const createParsed = createSourceDocumentInputSchema.parse({
      text: "Lunch 12.50",
      timezone: undefined,
    });
    const retryParsed = retrySourceDocumentInputSchema.parse({
      text: "Lunch 12.50",
      timezone: undefined,
    });

    expect(Object.prototype.hasOwnProperty.call(createParsed, "timezone")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(retryParsed, "timezone")).toBe(false);
  });

  it("omits undefined optional keys in source-document list schema", () => {
    const parsed = listSourceDocumentsInputSchema.parse({
      status: undefined,
      limit: "10",
    });

    expect(parsed.limit).toBe(10);
    expect(parsed.includeEntries).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed, "status")).toBe(false);
  });

  it("omits undefined optional keys in ledger list/stats schemas", () => {
    const listParsed = listLedgerEntriesInputSchema.parse({
      currency: undefined,
      minAmount: undefined,
      maxAmount: undefined,
      limit: "5",
    });
    const statsParsed = ledgerStatsQuerySchema.parse({
      categoryId: undefined,
    });

    expect(listParsed.limit).toBe(5);
    expect(Object.prototype.hasOwnProperty.call(listParsed, "currency")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(listParsed, "minAmount")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(listParsed, "maxAmount")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(statsParsed, "categoryId")).toBe(false);
  });

  it("coerces ledger minAmount and maxAmount query values into numbers", () => {
    const parsed = listLedgerEntriesInputSchema.parse({
      minAmount: "20",
      maxAmount: "100",
      limit: "5",
    });

    expect(parsed.limit).toBe(5);
    expect(parsed.minAmount).toBe(20);
    expect(parsed.maxAmount).toBe(100);
  });

  it("rejects blank ledger minAmount and maxAmount query values", () => {
    expect(() =>
      listLedgerEntriesInputSchema.parse({
        minAmount: "",
        limit: "5",
      })
    ).toThrow();

    expect(() =>
      listLedgerEntriesInputSchema.parse({
        maxAmount: "",
        limit: "5",
      })
    ).toThrow();
  });
});
