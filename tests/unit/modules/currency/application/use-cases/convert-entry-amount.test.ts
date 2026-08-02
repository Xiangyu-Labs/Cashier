import { afterEach, describe, expect, it, vi } from "vitest";
import { convertEntryAmount } from "@/modules/currency/application/use-cases/convert-entry-amount";
import type { FxRateBook } from "@/modules/currency/application/ports";

const rateBook = { convert: vi.fn() } as unknown as FxRateBook;

describe("convertEntryAmount", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a no-op conversion when currencies already match", async () => {
    const convertSpy = vi.spyOn(rateBook, "convert");

    const result = await convertEntryAmount(
      {
        amount: "100",
        fromCurrency: "CNY",
        toCurrency: "CNY",
        date: "2026-02-04",
      },
      rateBook
    );

    expect(result).toEqual({
      convertedAmount: "100.00",
      exchangeRate: "1",
    });
    expect(convertSpy).not.toHaveBeenCalled();
  });

  it("rejects when exchange-rate conversion fails", async () => {
    vi.spyOn(rateBook, "convert").mockRejectedValue(new Error("upstream unavailable"));

    await expect(
      convertEntryAmount(
        {
          amount: "100",
          fromCurrency: "USD",
          toCurrency: "CNY",
          date: "2026-02-04",
        },
        rateBook
      )
    ).rejects.toThrow("upstream unavailable");
  });
});
