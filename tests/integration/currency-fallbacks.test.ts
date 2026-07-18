import { beforeEach, describe, expect, it } from "vitest";
import { getTestDb } from "../setup";
import { currencyRates } from "@/persistence/schema/currency";
import { batchConvertCurrencyAction } from "@/modules/currency/actions";
import { convertCurrency } from "@/modules/currency/application/use-cases/convert-currency";

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
    const result = await batchConvertCurrencyAction(
      [{ amount: 100, currency: "ZZZ", date: testDate }],
      "USD"
    );

    expect(result).toEqual({ results: ["100"] });
  });

  it("batch conversion falls back to original amount when target currency is unknown", async () => {
    const result = await batchConvertCurrencyAction(
      [{ amount: 100, currency: "USD", date: testDate }],
      "ZZZ"
    );

    expect(result).toEqual({ results: ["100"] });
  });

  it("keeps order while mixing converted and fallback items", async () => {
    const result = await batchConvertCurrencyAction(
      [
        { amount: 100, currency: "CNY", date: testDate },
        { amount: 50, currency: "ZZZ", date: testDate },
        { amount: 25, currency: "USD", date: testDate },
      ],
      "USD"
    );

    expect(result.results).toHaveLength(3);
    expect(Number.parseFloat(result.results[0]!)).toBeCloseTo(14.67, 1);
    expect(result.results[1]).toBe("50");
    expect(result.results[2]).toBe("25");
  });

  it("single conversion still fails for unknown currency", async () => {
    await expect(
      convertCurrency({ amount: 100, from: "ZZZ", to: "USD", date: testDate })
    ).rejects.toThrow("Currency not found: ZZZ");
  });
});
