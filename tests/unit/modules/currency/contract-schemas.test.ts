import { describe, expect, it } from "vitest";
import { parseConvertCurrencyInput } from "@/modules/currency/contract-schemas";

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
});
