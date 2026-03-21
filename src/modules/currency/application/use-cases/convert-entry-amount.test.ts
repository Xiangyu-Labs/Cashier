import { afterEach, describe, expect, it, vi } from "vitest";
import { convertEntryAmount } from "./convert-entry-amount";
import { ExchangeRateService } from "@/modules/currency/application/services/exchange-rate";

describe("convertEntryAmount", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a no-op conversion when currencies already match", async () => {
    const convertSpy = vi.spyOn(ExchangeRateService, "convert");

    const result = await convertEntryAmount({
      amount: 100,
      fromCurrency: "CNY",
      toCurrency: "CNY",
      date: "2026-02-04",
    });

    expect(result).toEqual({
      convertedAmount: "100.00",
      exchangeRate: "1",
    });
    expect(convertSpy).not.toHaveBeenCalled();
  });

  it("returns null when exchange-rate conversion fails", async () => {
    vi.spyOn(ExchangeRateService, "convert").mockRejectedValue(new Error("upstream unavailable"));

    const result = await convertEntryAmount({
      amount: 100,
      fromCurrency: "USD",
      toCurrency: "CNY",
      date: "2026-02-04",
    });

    expect(result).toBeNull();
  });
});
