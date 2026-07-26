import { describe, expect, it } from "vitest";
import {
  formatCurrencyAmount,
  formatCompactCurrencyAmount,
  getCurrencySymbol,
} from "@/lib/format/currency";

describe("currency formatting", () => {
  it("formats regular amounts with a narrow currency symbol", () => {
    expect(formatCurrencyAmount(1234.5, "CNY", "en-US")).toBe("¥1,234.50");
    expect(formatCurrencyAmount(1234.5, "USD", "en-US")).toBe("$1,234.50");
  });

  it("formats compact amounts with a narrow currency symbol", () => {
    expect(formatCompactCurrencyAmount(12500, "CNY", "en-US")).toBe("¥12.5K");
  });

  it("extracts currency symbols for editable amount controls", () => {
    expect(getCurrencySymbol("EUR", "en-US")).toBe("€");
    expect(getCurrencySymbol("unknown", "en-US")).toBe("?");
  });

  it("never falls back to an ISO code for an invalid currency", () => {
    expect(formatCurrencyAmount(10, "invalid", "en-US")).toBe("¤10.00");
    expect(getCurrencySymbol("invalid", "en-US")).toBe("¤");
  });
});
