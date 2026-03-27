import { describe, expect, it } from "vitest";
import type { ParseSourceDocumentInput } from "@/modules/source-document/application/tasks/parse-source-document";
import {
  buildStage1Input,
  buildStage2Input,
} from "@/modules/source-document/application/parse-source-document/pipeline-stage-inputs";
import {
  resolveStage1Result,
  resolveStage2ExecutionResult,
} from "@/modules/source-document/application/parse-source-document/pipeline-stage-decisions";
import type { DocumentUnderstanding } from "@/modules/source-document/application/parse-source-document/types";

const baseInput: ParseSourceDocumentInput = {
  ledgerId: "ledger-1",
  sourceDocumentId: "doc-1",
  categories: [{ id: "cat-1", name: "Food", description: "Meals" }],
  settings: { aiCustomPrompt: "merge meals" },
  text: "Lunch 10 USD",
  imageUrls: ["https://example.com/doc.png"],
  aiLanguage: "en-US",
  preferredCurrencies: ["USD"],
};

const baseDocumentUnderstanding: DocumentUnderstanding = {
  documentType: "receipt",
  primaryEvidence: {
    merchant: "Cafe",
    totals: ["10 USD"],
    currencies: ["USD"],
    dates: ["2026-03-27"],
    lineItems: ["Lunch x1 10.00"],
  },
  secondaryEvidence: ["logo visible"],
  ambiguities: [],
  salienceHints: "Single-item receipt",
};

describe("pipeline-stage helpers", () => {
  it("builds stage 1 input from pipeline input without documentUnderstanding", () => {
    const result = buildStage1Input(baseInput, undefined);
    expect(result).toEqual({
      text: "Lunch 10 USD",
      imageUrls: ["https://example.com/doc.png"],
      aiLanguage: "en-US",
    });
  });

  it("builds stage 1 input with documentUnderstanding", () => {
    const result = buildStage1Input(baseInput, baseDocumentUnderstanding);
    expect(result).toEqual({
      text: "Lunch 10 USD",
      imageUrls: ["https://example.com/doc.png"],
      documentUnderstanding: baseDocumentUnderstanding,
      aiLanguage: "en-US",
    });
  });

  it("builds stage 2 input with all fields", () => {
    const result = buildStage2Input(baseInput, baseDocumentUnderstanding);
    expect(result).toEqual({
      text: "Lunch 10 USD",
      imageUrls: ["https://example.com/doc.png"],
      documentUnderstanding: baseDocumentUnderstanding,
      aiLanguage: "en-US",
      preferredCurrencies: ["USD"],
      aiCustomPrompt: "merge meals",
      originalCategories: [{ name: "Food", description: "Meals" }],
    });
  });

  it("resolveStage1Result returns invalid when isValid is false", () => {
    const result = resolveStage1Result({ isValid: false, reasoning: "no amount found" });
    expect(result).toEqual({ kind: "invalid" });
  });

  it("resolveStage1Result returns continue when isValid is true", () => {
    const result = resolveStage1Result({ isValid: true, reasoning: "valid receipt" });
    expect(result).toEqual({ kind: "continue" });
  });

  it("maps a stage 2 anomaly into the pipeline anomaly branch", () => {
    expect(resolveStage2ExecutionResult({ kind: "anomaly", reason: "Both wrong" })).toEqual({
      kind: "anomaly",
      anomalyReason: "Both wrong",
    });
  });

  it("maps a stage 2 success into the pipeline success branch", () => {
    const result = resolveStage2ExecutionResult({
      kind: "success",
      output: {
        title: "Lunch",
        entries: [
          {
            item_name: "Lunch",
            amount: 10,
            currency: "USD",
            category_index: 1,
            notes: null,
          },
        ],
        reasoning: "Single item",
        wasArbitrated: false,
      },
    });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.title).toBe("Lunch");
      expect(result.ledgerEntries).toHaveLength(1);
    }
  });
});
