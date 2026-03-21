import type {
  BatchConversionItem,
  BatchConvertCurrencyResult,
  ConvertCurrencyResult,
} from "./contracts";
import type { BatchConvertCurrencyResult as UseCasesBatchConvertCurrencyResult } from "./use-cases";
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

  it("exposes BatchConvertCurrencyResult from use-cases public surface", () => {
    const contractResult: BatchConvertCurrencyResult = { results: [7, 8] };
    const useCasesResult: UseCasesBatchConvertCurrencyResult = contractResult;
    expect(useCasesResult.results).toEqual([7, 8]);

    const useCasesSource = readFileSync(
      resolve(process.cwd(), "src/modules/currency/use-cases.ts"),
      "utf8"
    );
    expect(useCasesSource).toContain(
      "export type { BatchConvertCurrencyResult } from \"./contracts\";"
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
