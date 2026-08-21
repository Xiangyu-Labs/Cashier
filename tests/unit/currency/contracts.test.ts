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

  it("exports ConvertCurrencyResult with string converted", () => {
    const result: ConvertCurrencyResult = { converted: "42.00" };
    expect(typeof result.converted).toBe("string");
  });

  it("exports BatchConversionItem with decimal-string amount", () => {
    const item: BatchConversionItem = { amount: "100", currency: "USD" };
    expect(typeof item.amount).toBe("string");
    expect(item.date).toBeUndefined();
  });

  it("exports BatchConvertCurrencyResult with string results", () => {
    const result: BatchConvertCurrencyResult = { results: ["1.00", "2.00", "3.00"] };
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r) => typeof r === "string")).toBe(true);
  });

  it("keeps ConvertCurrencyResult compatible with the public use-cases type", () => {
    const contractResult: ConvertCurrencyResult = { converted: "13.00" };
    const useCaseResult: UseCaseConvertCurrencyResult = contractResult;
    expect(useCaseResult.converted).toBe("13.00");
  });
});
