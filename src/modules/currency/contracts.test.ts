import type {
  BatchConversionItem,
  BatchConvertCurrencyResult,
  ConvertCurrencyResult,
} from "./contracts";
import * as contracts from "./contracts";

describe("currency contracts exports", () => {
  it("imports contracts module at runtime", () => {
    expect(contracts).toBeDefined();
  });

  it("exports ConvertCurrencyResult", () => {
    const result: ConvertCurrencyResult = { converted: 42 };
    expect(typeof result.converted).toBe("number");
  });

  it("exports BatchConversionItem", () => {
    const item: BatchConversionItem = { amount: 100, currency: "USD" };
    expect(typeof item.amount).toBe("number");
    expect(item.date).toBeUndefined();
  });

  it("exports BatchConvertCurrencyResult", () => {
    const result: BatchConvertCurrencyResult = { results: [1, 2, 3] };
    expect(result.results).toHaveLength(3);
  });
});
