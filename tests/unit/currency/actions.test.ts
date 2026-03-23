import { afterEach, describe, expect, it, vi } from "vitest";
import {
  batchConvertCurrencyAction,
  convertCurrencyAction,
} from "@/modules/currency/actions";
import type { BatchConversionItem } from "@/modules/currency/contracts";
import { convertCurrency } from "@/modules/currency/application/use-cases/convert-currency";
import { convertAmountsBatch } from "@/modules/currency/application/use-cases/convert-amounts-batch";

vi.mock("../../../src/modules/currency/application/use-cases/convert-currency", () => ({
  convertCurrency: vi.fn(),
}));

vi.mock("../../../src/modules/currency/application/use-cases/convert-amounts-batch", () => ({
  convertAmountsBatch: vi.fn(),
}));

describe("currency actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("delegates single conversion to the application use-case", async () => {
    vi.mocked(convertCurrency).mockResolvedValue({ converted: 14.67 });

    const result = await convertCurrencyAction(100, "CNY", "USD", "2026-02-04");

    expect(convertCurrency).toHaveBeenCalledWith({
      amount: 100,
      from: "CNY",
      to: "USD",
      date: "2026-02-04",
    });
    expect(result).toEqual({ converted: 14.67 });
  });

  it("delegates batch conversion to the application use-case and unwraps results", async () => {
    const items: BatchConversionItem[] = [
      { amount: 100, currency: "CNY", date: "2026-02-04" },
      { amount: 50, currency: "", date: "2026-02-04" },
    ];

    vi.mocked(convertAmountsBatch).mockResolvedValue([
      { convertedAmount: 13.33, exchangeRate: 0.1333 },
      { convertedAmount: 50, exchangeRate: 1 },
    ]);

    const result = await batchConvertCurrencyAction(items, "EUR");

    expect(convertAmountsBatch).toHaveBeenCalledWith(
      [
        {
          amount: 100,
          fromCurrency: "CNY",
          toCurrency: "EUR",
          date: "2026-02-04",
        },
        {
          amount: 50,
          fromCurrency: "",
          toCurrency: "EUR",
          date: "2026-02-04",
        },
      ],
      "EUR",
      {
        allowBlankSourceCurrency: true,
        fallbackToOriginalAmountOnMissingRate: true,
      }
    );
    expect(result).toEqual({ results: [13.33, 50] });
  });
});
