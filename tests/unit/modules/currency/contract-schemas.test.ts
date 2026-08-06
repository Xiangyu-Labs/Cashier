import { describe, expect, it } from "vitest";
import {
  currencyCodeSchema,
  parseBatchConvertCurrencyInput,
  parseConvertCurrencyInput,
} from "@/modules/currency/contract-schemas";

describe("currency contract schemas", () => {
  it("parses currency conversion input with the module contract schema", () => {
    expect(parseConvertCurrencyInput({ amount: 12.5, from: "USD", to: "CNY" })).toEqual({
      amount: 12.5,
      from: "USD",
      to: "CNY",
    });
  });

  it("rejects blank conversion parameters before the use case runs", () => {
    expect(() => parseConvertCurrencyInput({ amount: 0, from: "", to: "" })).toThrow(
      "Missing required parameters"
    );
  });

  it("normalizes lowercase and whitespace-padded currency codes", () => {
    expect(currencyCodeSchema.parse(" usd ")).toBe("USD");
    expect(parseConvertCurrencyInput({ amount: 10, from: "cny", to: "usd" })).toEqual({
      amount: 10,
      from: "CNY",
      to: "USD",
    });
  });

  it("rejects unsupported currency codes", () => {
    expect(() => currencyCodeSchema.parse("ZZZ")).toThrow();
    expect(() => parseConvertCurrencyInput({ amount: 10, from: "USD", to: "BTH" })).toThrow(
      "Missing required parameters"
    );
  });

  it("allows positive, negative, and zero amounts for adjustment entries", () => {
    expect(parseConvertCurrencyInput({ amount: 0, from: "USD", to: "CNY" }).amount).toBe(0);
    expect(parseConvertCurrencyInput({ amount: -12.5, from: "USD", to: "CNY" }).amount).toBe(-12.5);
  });

  it("rejects NaN and Infinity amounts", () => {
    expect(() => parseConvertCurrencyInput({ amount: Number.NaN, from: "USD", to: "CNY" })).toThrow(
      "Missing required parameters"
    );
    expect(() =>
      parseConvertCurrencyInput({ amount: Number.POSITIVE_INFINITY, from: "USD", to: "CNY" })
    ).toThrow("Missing required parameters");
  });

  it("rejects malformed batch input and over-sized batches", () => {
    expect(() => parseBatchConvertCurrencyInput({ items: [], targetCurrency: "CNY" })).toThrow(
      "Missing required parameters"
    );
    expect(() =>
      parseBatchConvertCurrencyInput({
        items: [{ amount: 1, currency: "ZZZ" }],
        targetCurrency: "CNY",
      })
    ).toThrow("Missing required parameters");

    const tooMany = Array.from({ length: 501 }, () => ({ amount: 1, currency: "USD" }));
    expect(() => parseBatchConvertCurrencyInput({ items: tooMany, targetCurrency: "CNY" })).toThrow(
      "Missing required parameters"
    );
  });

  it("parses a valid batch with normalized currencies and optional dates", () => {
    const parsed = parseBatchConvertCurrencyInput({
      items: [
        { amount: -5, currency: " usd ", date: "2026-02-04" },
        { amount: 0, currency: "EUR" },
      ],
      targetCurrency: " cny ",
    });

    expect(parsed.targetCurrency).toBe("CNY");
    expect(parsed.items).toEqual([
      { amount: -5, currency: "USD", date: "2026-02-04" },
      { amount: 0, currency: "EUR" },
    ]);
  });
});
