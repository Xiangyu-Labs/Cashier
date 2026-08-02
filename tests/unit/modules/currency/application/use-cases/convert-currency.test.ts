import { afterEach, describe, expect, it, vi } from "vitest";
import { convertCurrency } from "@/modules/currency/application/use-cases/convert-currency";
import type { FxRateBook } from "@/modules/currency/application/ports";

const rateBook = { convert: vi.fn() } as unknown as FxRateBook;

describe("convertCurrency", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("normalizes YYYY-MM-DD input to a Date and delegates conversion", async () => {
    const convertSpy = vi.spyOn(rateBook, "convert").mockResolvedValue("14.67");

    const result = await convertCurrency(
      {
        amount: 100,
        from: "CNY",
        to: "USD",
        date: "2026-03-20",
      },
      rateBook
    );

    expect(result).toEqual({ converted: "14.67" });
    expect(convertSpy).toHaveBeenCalledTimes(1);

    const [amountArg, , , dateArg] = convertSpy.mock.calls[0] ?? [];
    expect(amountArg).toBe("100");
    expect(dateArg).toBeInstanceOf(Date);
    const parsed = dateArg as Date;
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(2);
    expect(parsed.getDate()).toBe(20);
  });

  it("returns a raw decimal string without rounding to cents", async () => {
    vi.spyOn(rateBook, "convert").mockResolvedValue("681.8181818181818");

    const result = await convertCurrency(
      {
        amount: 100,
        from: "USD",
        to: "CNY",
      },
      rateBook
    );

    expect(result).toEqual({ converted: "681.8181818181818" });
  });

  it("passes undefined date when date is absent or empty", async () => {
    const convertSpy = vi.spyOn(rateBook, "convert").mockResolvedValue("681.82");

    await convertCurrency(
      {
        amount: 100,
        from: "USD",
        to: "CNY",
      },
      rateBook
    );
    await convertCurrency(
      {
        amount: 100,
        from: "USD",
        to: "CNY",
        date: "",
      },
      rateBook
    );

    expect(convertSpy).toHaveBeenNthCalledWith(1, "100", "USD", "CNY", undefined);
    expect(convertSpy).toHaveBeenNthCalledWith(2, "100", "USD", "CNY", undefined);
  });
});
