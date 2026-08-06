import { describe, expect, it } from "vitest";
import {
  convertWithRates,
  resolveRateRatio,
} from "@/modules/currency/application/services/rate-calculation";
import type { ExchangeRates } from "@/modules/currency/application/ports";

const rates: ExchangeRates = {
  base: "EUR",
  date: "2026-02-04",
  rates: {
    USD: 1.1,
    CNY: 7.5,
  },
};

describe("rate calculation", () => {
  it("resolves the cross rate from provider rates", () => {
    expect(Number.parseFloat(resolveRateRatio(rates, "USD", "CNY"))).toBeCloseTo(6.818181818, 6);
    expect(Number.parseFloat(resolveRateRatio(rates, "CNY", "USD"))).toBeCloseTo(0.146666667, 6);
  });

  it("treats the base currency as rate 1 when missing from the rates map", () => {
    expect(resolveRateRatio(rates, "EUR", "USD")).toBe("1.1");
    expect(Number.parseFloat(resolveRateRatio(rates, "CNY", "EUR"))).toBeCloseTo(0.1333333333, 8);
  });

  it("keeps the real rate ratio for zero amounts", () => {
    const result = convertWithRates("0", rates, "USD", "CNY");
    expect(result.convertedAmount).toBe("0");
    expect(Number.parseFloat(result.exchangeRate)).toBeCloseTo(6.818181818, 6);
  });

  it("converts negative amounts (adjustment entries)", () => {
    const result = convertWithRates("-10", rates, "USD", "CNY");
    expect(Number.parseFloat(result.convertedAmount)).toBeCloseTo(-68.1818181818, 6);
    expect(Number.parseFloat(result.exchangeRate)).toBeCloseTo(6.818181818, 6);
  });

  it("throws CURRENCY_NOT_FOUND for unsupported currencies", () => {
    expect(() => resolveRateRatio(rates, "ZZZ", "CNY")).toThrow("Currency not found: ZZZ");
    expect(() => resolveRateRatio(rates, "USD", "ZZZ")).toThrow("Currency not found: ZZZ");
  });
});
