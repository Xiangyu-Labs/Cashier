import type {
  BatchConversionItem,
  BatchConvertCurrencyResult,
  BatchCurrencyConversionItem,
  ConvertAmountsBatchResult,
  ConvertCurrencyResult,
} from "./contracts";
import type { CurrencyBatchConversionResult } from "./use-cases";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("exports BatchCurrencyConversionItem", () => {
    const item: BatchCurrencyConversionItem = { amount: 100, from: "USD", to: "EUR" };
    expect(item).toEqual({ amount: 100, from: "USD", to: "EUR" });
    expect(item.date).toBeUndefined();
  });

  it("keeps ConvertAmountsBatchResult aligned with use-cases batch result type", () => {
    const contractResult: ConvertAmountsBatchResult = [{ convertedAmount: 7, exchangeRate: 1 }];
    const useCasesResult: CurrencyBatchConversionResult[] = contractResult;
    expect(useCasesResult[0]?.convertedAmount).toBe(7);

    const useCasesSource = readFileSync(
      resolve(process.cwd(), "src/modules/currency/use-cases.ts"),
      "utf8"
    );
    expect(useCasesSource).toContain(
      "type CurrencyBatchConversionResult"
    );
    expect(useCasesSource).toContain(
      "from \"./application/use-cases/convert-amounts-batch\";"
    );
  });

  it("keeps ConvertCurrencyResult sourced from shared contracts in actions", () => {
    const actionsSource = readFileSync(
      resolve(process.cwd(), "src/modules/currency/actions.ts"),
      "utf8"
    );

    expect(actionsSource).toContain("ConvertCurrencyResult");
    expect(actionsSource).toContain("from \"./contracts\"");
    expect(actionsSource).not.toContain("export interface ConvertCurrencyResult");
  });
});
