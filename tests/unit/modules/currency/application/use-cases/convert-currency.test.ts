import { afterEach, describe, expect, it, vi } from "vitest";
import { convertCurrency } from "../../../../../../src/modules/currency/application/use-cases/convert-currency";
import { ExchangeRateService } from "../../../../../../src/modules/currency/application/services/exchange-rate";

describe("convertCurrency", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when required parameters are missing", async () => {
    await expect(
      convertCurrency({
        amount: 0,
        from: "USD",
        to: "CNY",
      })
    ).rejects.toThrow("Missing required parameters");

    await expect(
      convertCurrency({
        amount: 100,
        from: "",
        to: "CNY",
      })
    ).rejects.toThrow("Missing required parameters");

    await expect(
      convertCurrency({
        amount: 100,
        from: "USD",
        to: "",
      })
    ).rejects.toThrow("Missing required parameters");
  });

  it("normalizes YYYY-MM-DD input to a Date and delegates conversion", async () => {
    const convertSpy = vi.spyOn(ExchangeRateService, "convert").mockResolvedValue(14.67);

    const result = await convertCurrency({
      amount: 100,
      from: "CNY",
      to: "USD",
      date: "2026-03-20",
    });

    expect(result).toEqual({ converted: 14.67 });
    expect(convertSpy).toHaveBeenCalledTimes(1);

    const [, , , dateArg] = convertSpy.mock.calls[0] ?? [];
    expect(dateArg).toBeInstanceOf(Date);
    const parsed = dateArg as Date;
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(2);
    expect(parsed.getDate()).toBe(20);
  });

  it("passes undefined date when date is absent or empty", async () => {
    const convertSpy = vi.spyOn(ExchangeRateService, "convert").mockResolvedValue(681.82);

    await convertCurrency({
      amount: 100,
      from: "USD",
      to: "CNY",
    });
    await convertCurrency({
      amount: 100,
      from: "USD",
      to: "CNY",
      date: "",
    });

    expect(convertSpy).toHaveBeenNthCalledWith(1, 100, "USD", "CNY", undefined);
    expect(convertSpy).toHaveBeenNthCalledWith(2, 100, "USD", "CNY", undefined);
  });
});
