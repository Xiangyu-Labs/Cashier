import { beforeEach, describe, expect, it } from "vitest";
import { getTestDb } from "../setup";
import { currencyRates } from "@/persistence/schema/currency";
import { convertAmountsBatch, convertCurrency } from "@/modules/currency/use-cases";

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

  it("batch conversion falls back to original amount when source currency is unknown", async () => {
    const result = await convertAmountsBatch(
      [{ amount: 100, fromCurrency: "ZZZ", toCurrency: "USD", date: testDate }],
      "USD",
      { fallbackToOriginalAmountOnMissingRate: true }
    );

    expect(result).toEqual([{ convertedAmount: 100, exchangeRate: 1 }]);
  });

  it("batch conversion falls back to original amount when target currency is unknown", async () => {
    const result = await convertAmountsBatch(
      [{ amount: 100, fromCurrency: "USD", toCurrency: "ZZZ", date: testDate }],
      "ZZZ",
      { fallbackToOriginalAmountOnMissingRate: true }
    );

    expect(result).toEqual([{ convertedAmount: 100, exchangeRate: 1 }]);
  });

  it("keeps order while mixing converted and fallback items", async () => {
    const result = await convertAmountsBatch(
      [
        { amount: 100, fromCurrency: "CNY", toCurrency: "USD", date: testDate },
        { amount: 50, fromCurrency: "ZZZ", toCurrency: "USD", date: testDate },
        { amount: 25, fromCurrency: "USD", toCurrency: "USD", date: testDate },
      ],
      "USD",
      { fallbackToOriginalAmountOnMissingRate: true }
    );

    expect(result).toHaveLength(3);
    expect(result[0]?.convertedAmount).toBeCloseTo(14.67, 1);
    expect(result[1]?.convertedAmount).toBe(50);
    expect(result[2]?.convertedAmount).toBe(25);
  });

  it("single conversion still fails for unknown currency", async () => {
    await expect(
      convertCurrency({ amount: 100, from: "ZZZ", to: "USD", date: testDate })
    ).rejects.toThrow("Currency not found: ZZZ");
  });
});
