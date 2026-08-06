import { afterEach, describe, expect, it, vi } from "vitest";
import { convertAmountsBatch } from "@/modules/currency/application/use-cases/convert-amounts-batch";
import type { FxRateBook } from "@/modules/currency/application/ports";

const rateBook = { getRates: vi.fn() } as unknown as FxRateBook;

describe("convertAmountsBatch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("loads rates once per unique date and preserves the original input order", async () => {
    const getRatesSpy = vi.spyOn(rateBook, "getRates").mockImplementation(async (date) => {
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
        { amount: "10", fromCurrency: "USD", toCurrency: "EUR", date: "2026-02-04" },
        { amount: "20", fromCurrency: "CNY", toCurrency: "USD", date: "2026-02-03" },
        { amount: "30", fromCurrency: "GBP", toCurrency: "EUR", date: "2026-02-04" },
      ],
      "EUR",
      rateBook
    );

    expect(getRatesSpy).toHaveBeenCalledTimes(2);
    expect(getRatesSpy).toHaveBeenNthCalledWith(1, "2026-02-04");
    expect(getRatesSpy).toHaveBeenNthCalledWith(2, "2026-02-03");

    // All results should be non-empty decimal strings
    expect(results[0]!.convertedAmount).toBeTypeOf("string");
    expect(results[0]!.exchangeRate).toBeTypeOf("string");
    expect(Number.parseFloat(results[0]!.convertedAmount)).toBeCloseTo(9.09, 2);
    expect(Number.parseFloat(results[1]!.convertedAmount)).toBeCloseTo(2.84, 2);
    expect(Number.parseFloat(results[2]!.convertedAmount)).toBeCloseTo(35.29, 2);
  });

  it("rejects blank or missing source currencies instead of using a 1:1 rate", async () => {
    vi.spyOn(rateBook, "getRates").mockResolvedValue({
      base: "EUR",
      date: "2026-02-04",
      rates: {
        USD: 1.1,
      },
    });

    await expect(
      convertAmountsBatch(
        [{ amount: "12", fromCurrency: "", toCurrency: "USD", date: "2026-02-04" }],
        "USD",
        rateBook
      )
    ).rejects.toThrow("Currency not found");
    await expect(
      convertAmountsBatch(
        [{ amount: "15", fromCurrency: "CNY", toCurrency: "USD", date: "2026-02-04" }],
        "USD",
        rateBook
      )
    ).rejects.toThrow("Currency not found: CNY");
  });

  it("propagates errors when a grouped exchange-rate lookup fails", async () => {
    vi.spyOn(rateBook, "getRates").mockImplementation(async (date) => {
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
          { amount: "100", fromCurrency: "CNY", toCurrency: "EUR", date: "2026-02-04" },
          { amount: "50", fromCurrency: "USD", toCurrency: "EUR", date: "2026-02-05" },
        ],
        "EUR",
        rateBook
      )
    ).rejects.toThrow("upstream rates unavailable");
  });

  it("never queries rates for an all-same-currency batch", async () => {
    const getRatesSpy = vi.spyOn(rateBook, "getRates");

    const results = await convertAmountsBatch(
      [
        { amount: "10", fromCurrency: "USD", date: "2026-02-04" },
        { amount: "20", fromCurrency: "USD", date: "2026-02-03" },
      ],
      "USD",
      rateBook
    );

    expect(getRatesSpy).not.toHaveBeenCalled();
    expect(results).toEqual([
      { convertedAmount: "10", exchangeRate: "1" },
      { convertedAmount: "20", exchangeRate: "1" },
    ]);
  });

  it("keeps the real exchange rate for zero-amount cross-currency items", async () => {
    vi.spyOn(rateBook, "getRates").mockResolvedValue({
      base: "EUR",
      date: "2026-02-04",
      rates: {
        USD: 1.1,
        CNY: 7.5,
      },
    });

    const results = await convertAmountsBatch(
      [{ amount: "0", fromCurrency: "USD", toCurrency: "CNY", date: "2026-02-04" }],
      "CNY",
      rateBook
    );

    expect(results[0]?.convertedAmount).toBe("0");
    expect(Number.parseFloat(results[0]?.exchangeRate ?? "")).toBeCloseTo(6.818181818181818, 12);
  });
});
