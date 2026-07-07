import { describe, expect, it } from "vitest";
import { formatCurrencyAmount, formatCompactCurrencyAmount } from "@/lib/format/currency";

describe("currency formatting", () => {
  it("formats regular amounts with currency code", () => {
    expect(formatCurrencyAmount(1234.5, "CNY", "en-US")).toBe("CNY 1,234.50");
  });

  it("formats compact amounts without hardcoded symbols", () => {
    expect(formatCompactCurrencyAmount(12500, "CNY", "en-US")).toBe("CNY 12.5K");
  });
});
