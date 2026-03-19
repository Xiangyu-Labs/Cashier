import { afterEach, describe, expect, it, vi } from "vitest";
import { batchConvertCurrencyAction } from "@/modules/currency/actions";
import { ExchangeRateService } from "@/modules/currency/services";

describe("batchConvertCurrencyAction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back failed date groups to original amounts while converting successful groups", async () => {
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

    const result = await batchConvertCurrencyAction(
      [
        { amount: 100, currency: "CNY", date: "2026-02-04" },
        { amount: 50, currency: "USD", date: "2026-02-05" },
        { amount: 220, currency: "USD", date: "2026-02-04" },
      ],
      "EUR"
    );

    expect(result.results).toHaveLength(3);
    expect(result.results[0]).toBeCloseTo(13.33, 1);
    expect(result.results[1]).toBe(50);
    expect(result.results[2]).toBeCloseTo(200, 0);
  });
});
