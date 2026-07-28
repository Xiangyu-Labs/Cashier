import { describe, expect, it } from "vitest";
import {
  ledgerStatsQuerySchema,
  parseListLedgerEntriesInput,
} from "@/modules/ledger/contract-schemas";

describe("search param validation", () => {
  it("normalizes search in listLedgerEntriesInputSchema", () => {
    expect(parseListLedgerEntriesInput({ search: "  coffee   receipt " }).search).toBe(
      "coffee receipt"
    );
  });

  it("normalizes search in ledgerStatsQuerySchema", () => {
    expect(ledgerStatsQuerySchema.parse({ search: " grocery " }).search).toBe("grocery");
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
