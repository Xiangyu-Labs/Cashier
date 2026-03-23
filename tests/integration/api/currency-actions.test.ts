import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../setup";
import { currencyRates } from "@/persistence/schema/currency";
import { convertCurrencyAction, batchConvertCurrencyAction } from "@/modules/currency/actions";

/**
 * Helper to insert test exchange rates into the database
 * Uses real database, no mocking of ExchangeRateService
 */
async function insertTestRates(date: string, rates: Record<string, number>) {
  await getTestDb().insert(currencyRates).values({
    date,
    base: "EUR",
    rates,
  });
}

describe("Currency Actions", () => {
  const testDate = "2026-02-04";
  const testRates = {
    CNY: 7.5,
    USD: 1.1,
    JPY: 160.0,
    GBP: 0.85,
  };

  beforeEach(async () => {
    // Insert test exchange rates (real database insert, no mock)
    await insertTestRates(testDate, testRates);
  });

  describe("convertCurrencyAction", () => {
    it("converts same currency (no-op)", async () => {
      const result = await convertCurrencyAction(100, "CNY", "CNY");
      expect(result.converted).toBe(100);
    });

    it("converts CNY to USD", async () => {
      const result = await convertCurrencyAction(100, "CNY", "USD", testDate);
      // CNY rate: 7.5, USD rate: 1.1
      // 100 CNY = 100 * (1.1 / 7.5) = 14.67 USD
      expect(result.converted).toBeCloseTo(14.67, 1);
    });

    it("converts USD to CNY", async () => {
      const result = await convertCurrencyAction(100, "USD", "CNY", testDate);
      // 100 USD = 100 * (7.5 / 1.1) = 681.82 CNY
      expect(result.converted).toBeCloseTo(681.82, 1);
    });

    it("converts EUR (base currency) to CNY", async () => {
      const result = await convertCurrencyAction(100, "EUR", "CNY", testDate);
      // EUR rate: 1.0 (base), CNY rate: 7.5
      // 100 EUR = 100 * (7.5 / 1.0) = 750 CNY
      expect(result.converted).toBeCloseTo(750, 0);
    });

    it("returns error for missing amount", async () => {
      await expect(convertCurrencyAction(0, "CNY", "USD")).rejects.toThrow(
        "Missing required parameters"
      );
    });

    it("returns error for missing fromCurrency", async () => {
      await expect(convertCurrencyAction(100, "", "USD")).rejects.toThrow(
        "Missing required parameters"
      );
    });

    it("returns error for missing toCurrency", async () => {
      await expect(convertCurrencyAction(100, "CNY", "")).rejects.toThrow(
        "Missing required parameters"
      );
    });
  });

  describe("batchConvertCurrencyAction", () => {
    it("converts multiple items to target currency", async () => {
      const items = [
        { amount: 100, currency: "CNY", date: testDate },
        { amount: 50, currency: "USD", date: testDate },
        { amount: 1000, currency: "JPY", date: testDate },
      ];

      const result = await batchConvertCurrencyAction(items, "EUR");
      expect(result.results).toHaveLength(3);

      // CNY 100 -> EUR: 100 / 7.5 = 13.33
      expect(result.results[0]).toBeCloseTo(13.33, 1);
      // USD 50 -> EUR: 50 / 1.1 = 45.45
      expect(result.results[1]).toBeCloseTo(45.45, 1);
      // JPY 1000 -> EUR: 1000 / 160 = 6.25
      expect(result.results[2]).toBeCloseTo(6.25, 1);
    });

    it("handles same currency items (no conversion needed)", async () => {
      const items = [
        { amount: 100, currency: "CNY", date: testDate },
        { amount: 200, currency: "CNY", date: testDate },
      ];

      const result = await batchConvertCurrencyAction(items, "CNY");
      expect(result.results).toEqual([100, 200]);
    });

    it("handles items without currency (passes through amount)", async () => {
      const items = [{ amount: 100, currency: "", date: testDate }];

      const result = await batchConvertCurrencyAction(items, "CNY");
      expect(result.results).toEqual([100]);
    });

    it("returns error for empty items array", async () => {
      await expect(batchConvertCurrencyAction([], "CNY")).rejects.toThrow(
        "Missing required parameters"
      );
    });

    it("returns error for missing target currency", async () => {
      const items = [{ amount: 100, currency: "CNY" }];
      await expect(batchConvertCurrencyAction(items, "")).rejects.toThrow(
        "Missing required parameters"
      );
    });

    it("handles items with different dates", async () => {
      // Insert rates for another date
      const anotherDate = "2026-02-03";
      await insertTestRates(anotherDate, {
        CNY: 7.6, // Slightly different rate
        USD: 1.08,
      });

      const items = [
        { amount: 100, currency: "CNY", date: testDate },
        { amount: 100, currency: "CNY", date: anotherDate },
      ];

      const result = await batchConvertCurrencyAction(items, "USD");
      expect(result.results).toHaveLength(2);
      // Different rates should produce different results
      // Date 1: 100 * (1.1 / 7.5) = 14.67
      // Date 2: 100 * (1.08 / 7.6) = 14.21
      expect(result.results[0]).toBeCloseTo(14.67, 1);
      expect(result.results[1]).toBeCloseTo(14.21, 1);
    });

    it("preserves original order of items", async () => {
      const items = [
        { amount: 10, currency: "USD", date: testDate },
        { amount: 20, currency: "CNY", date: testDate },
        { amount: 30, currency: "GBP", date: testDate },
        { amount: 40, currency: "JPY", date: testDate },
      ];

      const result = await batchConvertCurrencyAction(items, "EUR");
      expect(result.results).toHaveLength(4);
      // Results should be in same order as input
      // USD 10 -> EUR: 10 / 1.1 = 9.09
      expect(result.results[0]).toBeCloseTo(9.09, 1);
      // CNY 20 -> EUR: 20 / 7.5 = 2.67
      expect(result.results[1]).toBeCloseTo(2.67, 1);
      // GBP 30 -> EUR: 30 / 0.85 = 35.29
      expect(result.results[2]).toBeCloseTo(35.29, 1);
      // JPY 40 -> EUR: 40 / 160 = 0.25
      expect(result.results[3]).toBeCloseTo(0.25, 1);
    });
  });
});
