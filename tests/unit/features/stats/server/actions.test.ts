import { describe, it, expect } from "vitest";
import { convertAmount, calculateGrowth } from "@/features/stats/server/utils";

describe("Stats Utils", () => {
  describe("convertAmount", () => {
    const rates = {
      USD: 1.1, // 1 EUR = 1.1 USD
      CNY: 7.8, // 1 EUR = 7.8 CNY
    };

    it("should return original amount if currencies match", () => {
      const result = convertAmount({
        amount: 100,
        fromCurrency: "CNY",
        toCurrency: "CNY",
        rates,
      });
      expect(result).toBe(100);
    });

    it("should convert correctly using base currency logic", () => {
      // Convert 110 USD to CNY
      // 110 USD -> 100 EUR -> 780 CNY
      const result = convertAmount({
        amount: 110,
        fromCurrency: "USD",
        toCurrency: "CNY",
        rates,
      });
      expect(result).toBeCloseTo(780);
    });

    it("should fallback to 1:1 if rates are missing", () => {
      const result = convertAmount({
        amount: 100,
        fromCurrency: "USD",
        toCurrency: "CNY",
        rates: null,
      });
      expect(result).toBe(100);
    });
  });

  describe("calculateGrowth", () => {
    it("should calculate positive growth", () => {
      const result = calculateGrowth(150, 100);
      expect(result.percent).toBe(50);
      expect(result.amount).toBe(50);
    });

    it("should calculate negative growth (decline)", () => {
      const result = calculateGrowth(80, 100);
      expect(result.percent).toBe(-20);
      expect(result.amount).toBe(-20);
    });

    it("should handle zero previous value", () => {
      const result = calculateGrowth(100, 0);
      expect(result.percent).toBe(100);
    });
  });
});
