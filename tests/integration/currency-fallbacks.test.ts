import { beforeEach, describe, expect, it } from "vitest";
import { getTestDb } from "../setup";
import { currencyRates } from "@/persistence/schema/currency";
import { convertAmountsBatch } from "@/modules/currency/application/use-cases/convert-amounts-batch";
import { convertCurrency } from "@/modules/currency/application/use-cases/convert-currency";
import { ExchangeRateService } from "@/application/adapters/postgres/exchange-rate";

async function insertTestRates(date: string, rates: Record<string, number>) {
  await getTestDb().insert(currencyRates).values({
    date,
    base: "EUR",
    rates,
  });
}

describe("currency fallbacks integration", () => {
  const testDate = "2026-03-20";

  beforeEach(async () => {
    await insertTestRates(testDate, {
      CNY: 7.5,
      USD: 1.1,
    });
  });

  it("batch conversion rejects an unknown source currency", async () => {
    await expect(
      convertAmountsBatch(
        [{ amount: "100", fromCurrency: "ZZZ", date: testDate }],
        "USD",
        ExchangeRateService
      )
    ).rejects.toThrow("Currency not found: ZZZ");
  });

  it("batch conversion rejects an unknown target currency", async () => {
    await expect(
      convertAmountsBatch(
        [{ amount: "100", fromCurrency: "USD", date: testDate }],
        "ZZZ",
        ExchangeRateService
      )
    ).rejects.toThrow("Currency not found: ZZZ");
  });

  it("does not partially return a mixed batch with an unknown currency", async () => {
    await expect(
      convertAmountsBatch(
        [
          { amount: "100", fromCurrency: "CNY", date: testDate },
          { amount: "50", fromCurrency: "ZZZ", date: testDate },
          { amount: "25", fromCurrency: "USD", date: testDate },
        ],
        "USD",
        ExchangeRateService
      )
    ).rejects.toThrow("Currency not found: ZZZ");
  });

  it("single conversion still fails for unknown currency", async () => {
    await expect(
      convertCurrency({ amount: 100, from: "ZZZ", to: "USD", date: testDate }, ExchangeRateService)
    ).rejects.toThrow("Currency not found: ZZZ");
  });
});
