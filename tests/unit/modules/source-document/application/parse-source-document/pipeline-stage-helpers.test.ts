import { describe, expect, it } from "vitest";
import type { ParseSourceDocumentInput } from "@/modules/source-document/application/tasks/parse-source-document";
import type {
  Stage1Results,
  ValidationSummary,
} from "@/modules/source-document/application/parse-source-document/types";
import {
  buildStage1Input,
  buildStage1ValidationInput,
  buildStage2Input,
} from "@/modules/source-document/application/parse-source-document/pipeline-stage-inputs";
import {
  resolveStage1ExecutionResult,
  resolveStage1ValidationResult,
  resolveStage2ExecutionResult,
} from "@/modules/source-document/application/parse-source-document/pipeline-stage-decisions";

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

const baseStage1Results: Stage1Results = {
  validity: { is_valid: true, reasoning: "valid" },
  currency: { currencies: ["USD"], reasoning: "symbol" },
  category: { categories: ["Food"], reasoning: "meal" },
  title: { title: "Lunch" },
};

const baseValidationSummary: ValidationSummary = {
  is_reasonable: true,
  summary: {
    title: "Lunch",
    currencies: [{ code: "USD", hint: "$" }],
    categories: [{ name: "Food", hint: "meal" }],
  },
};

describe("pipeline-stage helpers", () => {
  it("builds stage 1.5 and stage 2 inputs without duplicating mapping logic", () => {
    expect(buildStage1Input(baseInput, "vision summary")).toEqual({
      text: "Lunch 10 USD",
      imageUrls: ["https://example.com/doc.png"],
      visionDescription: "vision summary",
      aiLanguage: "en-US",
      preferredCurrencies: ["USD"],
      aiCustomPrompt: "merge meals",
      categories: [{ name: "Food", description: "Meals" }],
    });

    expect(buildStage1ValidationInput(baseInput, "vision summary", baseStage1Results)).toEqual({
      text: "Lunch 10 USD",
      imageUrls: ["https://example.com/doc.png"],
      visionDescription: "vision summary",
      aiLanguage: "en-US",
      stage1Results: baseStage1Results,
    });

    expect(buildStage2Input(baseInput, "vision summary", baseValidationSummary)).toEqual({
      text: "Lunch 10 USD",
      imageUrls: ["https://example.com/doc.png"],
      visionDescription: "vision summary",
      aiLanguage: "en-US",
      validationSummary: baseValidationSummary,
      originalCategories: [{ name: "Food", description: "Meals" }],
    });
  });

  it("turns unknown currencies into an anomaly before stage 1.5", () => {
    const result = resolveStage1ExecutionResult({
      isValid: true,
      isIncomplete: false,
      results: {
        ...baseStage1Results,
        currency: { currencies: ["unknown"], reasoning: "unclear" },
      },
    });

    expect(result).toEqual({
      kind: "anomaly",
      anomalyReason: "Unable to recognize currency type",
    });
  });

  it("uses the validation rejection reason when stage 1.5 vetoes the result", () => {
    expect(
      resolveStage1ValidationResult({
        is_reasonable: false,
        rejection_reason: "Currency mismatch",
      })
    ).toEqual({
      kind: "anomaly",
      anomalyReason: "Currency mismatch",
    });
  });

  it("maps a stage 2 anomaly into the pipeline anomaly branch", () => {
    expect(resolveStage2ExecutionResult({ kind: "anomaly", reason: "Both wrong" })).toEqual({
      kind: "anomaly",
      anomalyReason: "Parsing results diverged",
    });
  });
});
