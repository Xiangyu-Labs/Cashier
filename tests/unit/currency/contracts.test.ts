import type {
  BatchConversionItem,
  BatchConvertCurrencyResult,
  BatchCurrencyConversionItem,
  ConvertAmountsBatchResult,
  ConvertCurrencyResult,
} from "@/modules/currency/contracts";
import type { ConvertCurrencyResult as ActionConvertCurrencyResult } from "@/modules/currency/actions";
import type { CurrencyBatchConversionResult } from "@/modules/currency/use-cases";
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

  it("exports BatchCurrencyConversionItem", () => {
    const item: BatchCurrencyConversionItem = { amount: 100, from: "USD", to: "EUR" };
    expect(item).toEqual({ amount: 100, from: "USD", to: "EUR" });
    expect(item.date).toBeUndefined();
  });

  it("keeps ConvertAmountsBatchResult aligned with use-cases batch result type", () => {
    const contractResult: ConvertAmountsBatchResult = [{ convertedAmount: 7, exchangeRate: 1 }];
    const useCasesResult: CurrencyBatchConversionResult[] = contractResult;
    expect(useCasesResult[0]?.convertedAmount).toBe(7);
  });

  it("keeps ConvertCurrencyResult compatible across contracts and actions API", () => {
    const contractResult: ConvertCurrencyResult = { converted: 13 };
    const actionResult: ActionConvertCurrencyResult = contractResult;
    expect(actionResult.converted).toBe(13);
  });
});
