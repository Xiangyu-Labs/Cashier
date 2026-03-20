import { afterEach, describe, expect, it, vi } from "vitest";
import { convertAmountsBatch } from "./convert-amounts-batch";
import { ExchangeRateService } from "../../ExchangeRateService";

describe("convertAmountsBatch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads rates once per unique date and preserves the original input order", async () => {
    const getRatesSpy = vi.spyOn(ExchangeRateService, "getRates").mockImplementation(async (date) => {
      if (date === "2026-02-03") {
        return {
          base: "EUR",
          date: "2026-02-03",
          rates: {
            USD: 1.08,
            CNY: 7.6,
          },
        };
      }

      return {
        base: "EUR",
        date: "2026-02-04",
        rates: {
          USD: 1.1,
          CNY: 7.5,
          GBP: 0.85,
        },
      };
    });

    const results = await convertAmountsBatch(
      [
        { amount: 10, fromCurrency: "USD", toCurrency: "EUR", date: "2026-02-04" },
        { amount: 20, fromCurrency: "CNY", toCurrency: "USD", date: "2026-02-03" },
        { amount: 30, fromCurrency: "GBP", toCurrency: "EUR", date: "2026-02-04" },
      ],
      "EUR"
    );

    expect(getRatesSpy).toHaveBeenCalledTimes(2);
    expect(getRatesSpy).toHaveBeenNthCalledWith(1, "2026-02-04");
    expect(getRatesSpy).toHaveBeenNthCalledWith(2, "2026-02-03");
    expect(results).toEqual([
      { convertedAmount: expect.closeTo(9.09, 2), exchangeRate: expect.closeTo(0.909, 3) },
      { convertedAmount: expect.closeTo(2.84, 2), exchangeRate: expect.closeTo(0.142, 3) },
      { convertedAmount: expect.closeTo(35.29, 2), exchangeRate: expect.closeTo(1.176, 3) },
    ]);
  });

  it("falls back to the original amount when source currency is blank or missing from rates", async () => {
    vi.spyOn(ExchangeRateService, "getRates").mockResolvedValue({
      base: "EUR",
      date: "2026-02-04",
      rates: {
        USD: 1.1,
      },
    });

    const results = await convertAmountsBatch(
      [
        { amount: 12, fromCurrency: "", toCurrency: "USD", date: "2026-02-04" },
        { amount: 15, fromCurrency: "CNY", toCurrency: "USD", date: "2026-02-04" },
      ],
      "USD",
      {
        allowBlankSourceCurrency: true,
        fallbackToOriginalAmountOnMissingRate: true,
      }
    );

    expect(results).toEqual([
      { convertedAmount: 12, exchangeRate: 1 },
      { convertedAmount: 15, exchangeRate: 1 },
    ]);
  });

  it("propagates errors when a grouped exchange-rate lookup fails", async () => {
    vi.spyOn(ExchangeRateService, "getRates").mockImplementation(async (date) => {
      if (date === "2026-02-05") {
        throw new Error("upstream rates unavailable");
      }

      return {
        base: "EUR",
        date: "2026-02-04",
        rates: {
          USD: 1.1,
          CNY: 7.5,
        },
      };
    });

    await expect(
      convertAmountsBatch(
        [
          { amount: 100, fromCurrency: "CNY", toCurrency: "EUR", date: "2026-02-04" },
          { amount: 50, fromCurrency: "USD", toCurrency: "EUR", date: "2026-02-05" },
        ],
        "EUR"
      )
    ).rejects.toThrow("upstream rates unavailable");
  });
});
