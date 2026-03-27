import { describe, it, expect, vi } from "vitest";
import {
  executeStage1,
  type Stage1Input,
} from "@/modules/source-document/application/parse-source-document/stage1-executor";
import type { AIContext, AIGenerateOptions, AIResponse } from "@/lib/flow/types";
import type { DocumentUnderstanding } from "@/modules/source-document/application/parse-source-document/types";

function createMockAI(responses: string[]): AIContext {
  let callIndex = 0;
  return {
    generate: vi.fn(async (_options: AIGenerateOptions): Promise<AIResponse> => {
      const content = responses[callIndex] ?? '{"error": "no more responses"}';
      callIndex++;
      return { content, usage: { promptTokens: 100, completionTokens: 50 } };
    }),
  };
}

const baseDocumentUnderstanding: DocumentUnderstanding = {
  documentType: "receipt",
  primaryEvidence: {
    merchant: "Cafe",
    totals: ["45 CNY"],
    currencies: ["CNY"],
    dates: ["2026-03-27"],
    lineItems: ["午餐 x1 45.00"],
  },
  secondaryEvidence: [],
  ambiguities: [],
  salienceHints: "Clear single-item receipt",
};

const baseInput: Stage1Input = {
  text: "午餐 45元",
  imageUrls: [],
  aiLanguage: "zh-CN",
  documentUnderstanding: baseDocumentUnderstanding,
};

describe("Stage 1 Executor", () => {
  it("returns isValid false when document is invalid", async () => {
    const mockAI = createMockAI([
      '{"is_valid": false, "reasoning": "无法识别金额"}',
    ]);

    const result = await executeStage1(baseInput, mockAI);

    expect(result.isValid).toBe(false);
    expect(result.reasoning).toBe("无法识别金额");
    expect(mockAI.generate).toHaveBeenCalledTimes(1);
  });

  it("returns isValid true for a valid document", async () => {
    const mockAI = createMockAI([
      '{"is_valid": true, "reasoning": "Clear receipt with amount"}',
    ]);

    const result = await executeStage1(baseInput, mockAI);

    expect(result.isValid).toBe(true);
    expect(result.reasoning).toBe("Clear receipt with amount");
    expect(mockAI.generate).toHaveBeenCalledTimes(1);
  });

  it("works without documentUnderstanding", async () => {
    const mockAI = createMockAI([
      '{"is_valid": true, "reasoning": "Has amount"}',
    ]);

    const inputWithoutUnderstanding: Stage1Input = {
      text: "午餐 45元",
      imageUrls: [],
    };

    const result = await executeStage1(inputWithoutUnderstanding, mockAI);

    expect(result.isValid).toBe(true);
    expect(mockAI.generate).toHaveBeenCalledTimes(1);
  });

  it("makes a single AI call (validity-only gate)", async () => {
    const mockAI = createMockAI([
      '{"is_valid": true, "reasoning": "valid"}',
    ]);

    await executeStage1(baseInput, mockAI);

    expect(mockAI.generate).toHaveBeenCalledTimes(1);
  });
});
