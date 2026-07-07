import type {
  BatchConversionItem,
  BatchConvertCurrencyResult,
  ConvertCurrencyResult,
} from "@/modules/currency/contracts";
import type { ConvertCurrencyResult as UseCaseConvertCurrencyResult } from "@/modules/currency/application/use-cases/convert-currency";
import * as contracts from "@/modules/currency/contracts";

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

  it("keeps ConvertCurrencyResult compatible with the public use-cases type", () => {
    const contractResult: ConvertCurrencyResult = { converted: 13 };
    const useCaseResult: UseCaseConvertCurrencyResult = contractResult;
    expect(useCaseResult.converted).toBe(13);
  });
});
