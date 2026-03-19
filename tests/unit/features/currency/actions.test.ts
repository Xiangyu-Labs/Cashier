import { afterEach, describe, expect, it, vi } from "vitest";
import { batchConvertCurrencyAction } from "@/modules/currency/actions";
import { ExchangeRateService } from "@/modules/currency/services";

describe("batchConvertCurrencyAction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when any exchange-rate date group fails to load", async () => {
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
      batchConvertCurrencyAction(
        [
          { amount: 100, currency: "CNY", date: "2026-02-04" },
          { amount: 50, currency: "USD", date: "2026-02-05" },
          { amount: 220, currency: "USD", date: "2026-02-04" },
        ],
        "EUR"
      )
    ).rejects.toThrow("upstream rates unavailable");
  });
});
