import Decimal from "decimal.js";
import { describe, it, expect } from "vitest";
import {
  parse,
  normalize,
  abs,
  add,
  subtract,
  multiply,
  divide,
  compare,
  round,
  allocate,
  isValidDecimal,
} from "@/lib/money/decimal";
import {
  getCurrencyDecimals,
  roundToCurrency,
  DEFAULT_DECIMALS,
} from "@/lib/money/currency-precision";

describe("decimal", () => {
  describe("add", () => {
    it("0.1 + 0.2 equals 0.3 (no floating-point error)", () => {
      const result = add("0.1", "0.2");
      expect(result).toBe("0.3");
    });

    it("handles negative amounts", () => {
      expect(add("-10.50", "5.25")).toBe("-5.25");
    });

    it("handles zero", () => {
      expect(add("0", "0")).toBe("0");
    });
  });

  describe("subtract", () => {
    it("basic subtraction", () => {
      expect(subtract("10.00", "4.50")).toBe("5.5");
    });

    it("negative result", () => {
      expect(subtract("5.00", "10.00")).toBe("-5");
    });
  });

  describe("multiply", () => {
    it("basic multiplication", () => {
      expect(multiply("2.50", "3.00")).toBe("7.5");
    });

    it("handles very small exchange rates", () => {
      const result = multiply("0.01", "0.00012345");
      expect(result).toBe("0.0000012345");
    });
  });

  describe("divide", () => {
    it("basic division", () => {
      expect(divide("10.00", "3.00")).toBe("3.33333333333333333333");
    });

    it("uses private precision and emits at most 20 decimal places", () => {
      expect(Decimal.precision).toBe(20);
      expect(divide("1", "7")).toBe("0.14285714285714285714");
    });
  });

  describe("compare", () => {
    it("returns -1 when a < b", () => {
      expect(compare("1.00", "2.00")).toBe(-1);
    });

    it("returns 0 when a === b", () => {
      expect(compare("1.50", "1.50")).toBe(0);
    });

    it("returns 1 when a > b", () => {
      expect(compare("3.00", "1.00")).toBe(1);
    });
  });

  describe("abs", () => {
    it("returns the same value for positive numbers", () => {
      expect(abs("42.00")).toBe("42");
    });

    it("returns the absolute value for negative numbers", () => {
      expect(abs("-42.00")).toBe("42");
    });

    it("handles zero", () => {
      expect(abs("0")).toBe("0");
    });
  });

  describe("round", () => {
    it("rounds half-up to 2 decimal places", () => {
      expect(round("1.2345", 2)).toBe("1.23");
      expect(round("1.2355", 2)).toBe("1.24");
    });

    it("rounds to 0 decimal places", () => {
      expect(round("123.45", 0)).toBe("123");
      expect(round("123.55", 0)).toBe("124");
    });

    it("rounds to 3 decimal places", () => {
      expect(round("1.2345", 3)).toBe("1.235");
    });

    it("rounds to 6 decimal places (exchange rate precision)", () => {
      expect(round("1.23456789", 6)).toBe("1.234568");
    });

    it("canonicalizes negative zero", () => {
      expect(normalize("-0.000")).toBe("0");
      expect(round("-0.001", 2)).toBe("0");
    });
  });

  describe("allocate", () => {
    it("sum of allocated parts equals original value", () => {
      const result = allocate("10.00", [1, 2, 2]);
      const sum = result.reduce((acc, v) => add(acc, v), "0");
      expect(sum).toBe("10");
    });

    it("handles single ratio", () => {
      const result = allocate("10.00", [1]);
      expect(result).toEqual(["10.00"]);
    });

    it("handles zero ratios (equal split)", () => {
      const result = allocate("10.00", [0, 0, 0]);
      const sum = result.reduce((acc, v) => add(acc, v), "0");
      expect(sum).toBe("10");
      expect(result.length).toBe(3);
    });

    it("handles negative amounts", () => {
      const result = allocate("-10.00", [1, 1]);
      const sum = result.reduce((acc, v) => add(acc, v), "0");
      expect(sum).toBe("-10");
    });

    it("empty ratios returns empty array", () => {
      expect(allocate("10.00", [])).toEqual([]);
    });
  });

  describe("isValidDecimal", () => {
    it("accepts normal decimal strings", () => {
      expect(isValidDecimal("123.45")).toBe(true);
      expect(isValidDecimal("0")).toBe(true);
      expect(isValidDecimal("-10.50")).toBe(true);
    });

    it("rejects NaN", () => {
      expect(isValidDecimal("NaN")).toBe(false);
    });

    it("rejects Infinity", () => {
      expect(isValidDecimal("Infinity")).toBe(false);
      expect(isValidDecimal("-Infinity")).toBe(false);
    });

    it("rejects exponent notation (decimal.js compatible but not allowed per spec)", () => {
      expect(isValidDecimal("1e2")).toBe(false);
      expect(isValidDecimal("1E2")).toBe(false);
      expect(isValidDecimal("1e+2")).toBe(false);
      expect(isValidDecimal("1e-2")).toBe(false);
    });

    it("rejects non-numeric strings", () => {
      expect(isValidDecimal("abc")).toBe(false);
      expect(isValidDecimal("")).toBe(false);
    });
  });

  describe("parse", () => {
    it("parses string input", () => {
      const d = parse("123.45");
      expect(d.toNumber()).toBe(123.45);
    });

    it("parses number input", () => {
      const d = parse(123.45);
      expect(d.toNumber()).toBe(123.45);
    });

    it("parses decimal.js instance", () => {
      const d = parse(new Decimal("123.45"));
      expect(d.toNumber()).toBe(123.45);
    });
  });

  describe("normalize", () => {
    it("removes trailing zeros", () => {
      expect(normalize("1.23000")).toBe("1.23");
    });

    it("handles exponent notation", () => {
      expect(normalize("1e2")).toBe("100");
    });

    it("keeps zero as zero", () => {
      expect(normalize("0")).toBe("0");
    });
  });
});

describe("currency-precision", () => {
  describe("getCurrencyDecimals", () => {
    it("returns 2 for most currencies", () => {
      expect(getCurrencyDecimals("USD")).toBe(2);
      expect(getCurrencyDecimals("EUR")).toBe(2);
      expect(getCurrencyDecimals("GBP")).toBe(2);
      expect(getCurrencyDecimals("CNY")).toBe(2);
      expect(getCurrencyDecimals("AUD")).toBe(2);
    });

    it("returns 0 for zero-decimal currencies", () => {
      expect(getCurrencyDecimals("JPY")).toBe(0);
      expect(getCurrencyDecimals("KRW")).toBe(0);
      expect(getCurrencyDecimals("VND")).toBe(0);
      expect(getCurrencyDecimals("CLP")).toBe(0);
      expect(getCurrencyDecimals("COP")).toBe(0);
      expect(getCurrencyDecimals("ISK")).toBe(0);
    });

    it("returns 3 for three-decimal currencies", () => {
      expect(getCurrencyDecimals("BHD")).toBe(3);
      expect(getCurrencyDecimals("JOD")).toBe(3);
      expect(getCurrencyDecimals("KWD")).toBe(3);
      expect(getCurrencyDecimals("OMR")).toBe(3);
      expect(getCurrencyDecimals("TND")).toBe(3);
    });

    it("falls back to 2 for unknown currencies", () => {
      expect(getCurrencyDecimals("XYZ")).toBe(2);
      expect(getCurrencyDecimals("")).toBe(2);
    });
  });

  describe("roundToCurrency", () => {
    it("rounds to 2 decimals for USD", () => {
      expect(roundToCurrency("1.2345", "USD")).toBe("1.23");
      expect(roundToCurrency("1.2355", "USD")).toBe("1.24");
    });

    it("rounds to 0 decimals for JPY", () => {
      expect(roundToCurrency("123.45", "JPY")).toBe("123");
    });

    it("rounds to 3 decimals for BHD", () => {
      expect(roundToCurrency("1.2345", "BHD")).toBe("1.235");
    });

    it("returns DEFAULT_DECIMALS value", () => {
      expect(DEFAULT_DECIMALS).toBe(2);
    });
  });
});
