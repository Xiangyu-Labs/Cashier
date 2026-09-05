import { afterEach, describe, expect, it, vi } from "vitest";
import {
  batchConvertCurrencyAction,
  convertCurrencyAction,
} from "@/modules/currency/server-actions/convert-currency";
import type { BatchConversionItem } from "@/modules/currency/contracts";
import { convertCurrency } from "@/modules/currency/application/use-cases/convert-currency";
import { convertAmountsBatch } from "@/modules/currency/application/use-cases/convert-amounts-batch";

vi.mock("@/modules/ledger/access", () => ({
  withLedgerAccess:
    (action: (...args: unknown[]) => Promise<unknown>) =>
    (...args: unknown[]) =>
      action(...args),
}));

const LEDGER_ID = "10000000-0000-4000-8000-000000000001";

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
    vi.mocked(convertCurrency).mockResolvedValue({ converted: "14.67" });

    const result = await convertCurrencyAction(LEDGER_ID, "100", "CNY", "USD", "2026-02-04");

    expect(convertCurrency).toHaveBeenCalledWith(
      {
        amount: "100",
        from: "CNY",
        to: "USD",
        date: "2026-02-04",
      },
      expect.objectContaining({ convert: expect.any(Function) })
    );
    expect(result).toEqual({ converted: "14.67" });
  });

  it("delegates batch conversion to the application use-case and unwraps results", async () => {
    const items: BatchConversionItem[] = [
      { amount: "100", currency: "CNY", date: "2026-02-04" },
      { amount: "50", currency: "EUR", date: "2026-02-04" },
    ];

    vi.mocked(convertAmountsBatch).mockResolvedValue([
      { convertedAmount: "13.33", exchangeRate: "0.1333" },
      { convertedAmount: "50", exchangeRate: "1" },
    ]);

    const result = await batchConvertCurrencyAction(LEDGER_ID, items, "EUR");

    expect(convertAmountsBatch).toHaveBeenCalledWith(
      [
        {
          amount: "100",
          fromCurrency: "CNY",
          toCurrency: "EUR",
          date: "2026-02-04",
        },
        {
          amount: "50",
          fromCurrency: "EUR",
          toCurrency: "EUR",
          date: "2026-02-04",
        },
      ],
      "EUR",
      expect.objectContaining({ getRates: expect.any(Function) })
    );
    expect(result).toEqual({ results: ["13.33", "50"] });
  });

  it("rejects invalid batch currencies before the use case runs", async () => {
    await expect(
      batchConvertCurrencyAction(LEDGER_ID, [{ amount: "50", currency: "" }], "EUR")
    ).rejects.toThrow("Missing required parameters");
    expect(convertAmountsBatch).not.toHaveBeenCalled();
  });
});
