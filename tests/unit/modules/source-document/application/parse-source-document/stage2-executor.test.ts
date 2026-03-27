import { describe, it, expect, vi } from "vitest";
import {
  executeStage2,
  type Stage2Input,
} from "@/modules/source-document/application/parse-source-document/stage2-executor";
import type { AIContext, AIGenerateOptions, AIResponse } from "@/lib/flow/types";
import type { DocumentUnderstanding } from "@/modules/source-document/application/parse-source-document/types";

const baseDocumentUnderstanding: DocumentUnderstanding = {
  documentType: "receipt",
  primaryEvidence: {
    merchant: "餐厅",
    totals: ["45 CNY"],
    currencies: ["CNY"],
    dates: ["2026-02-05"],
    lineItems: ["午餐 x1 45.00"],
  },
  secondaryEvidence: [],
  ambiguities: [],
  salienceHints: "Single-item receipt",
};

const baseInput: Stage2Input = {
  text: "午餐 ¥45",
  imageUrls: [],
  aiLanguage: "zh-CN",
  documentUnderstanding: baseDocumentUnderstanding,
  originalCategories: [
    { name: "餐饮", description: "食物消费" },
    { name: "交通", description: "出行费用" },
  ],
};

const successResponse = JSON.stringify({
  outcome: "success",
  title: "午餐消费",
  ledger_entries: [
    {
      item_name: "午餐",
      amount: 45,
      currency: "CNY",
      category_index: 1,
      entry_date: "2026-02-05",
      notes: null,
    },
  ],
  reasoning: "Single lunch item",
});

describe("Stage 2 Executor", () => {
  describe("Dual GPT Agreement", () => {
    it("should return entries when both GPTs agree", async () => {
      const mockAI: AIContext = {
        generate: vi.fn(
          async (_opts: AIGenerateOptions): Promise<AIResponse> => ({
            content: successResponse,
            usage: { promptTokens: 100, completionTokens: 50 },
          })
        ),
      };

      const result = await executeStage2(baseInput, mockAI);

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.output.entries).toHaveLength(1);
        expect(result.output.entries[0]?.item_name).toBe("午餐");
        expect(result.output.entries[0]?.amount).toBe(45);
        expect(result.output.wasArbitrated).toBe(false);
      }
      // 2 calls for dual parsing (no arbitration since they agree)
      expect(mockAI.generate).toHaveBeenCalledTimes(2);
    });

    it("should include title from parse result", async () => {
      const mockAI: AIContext = {
        generate: vi.fn(
          async (_opts: AIGenerateOptions): Promise<AIResponse> => ({
            content: successResponse,
            usage: { promptTokens: 100, completionTokens: 50 },
          })
        ),
      };

      const result = await executeStage2(baseInput, mockAI);

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.output.title).toBe("午餐消费");
      }
    });
  });

  describe("Anomaly Handling", () => {
    it("should return anomaly when both GPTs return anomaly", async () => {
      const anomalyResponse = JSON.stringify({
        outcome: "anomaly",
        anomaly_reason: "无法识别金额",
        ledger_entries: [],
        reasoning: "Document unclear",
      });

      const mockAI: AIContext = {
        generate: vi.fn(
          async (_opts: AIGenerateOptions): Promise<AIResponse> => ({
            content: anomalyResponse,
            usage: { promptTokens: 100, completionTokens: 50 },
          })
        ),
      };

      const result = await executeStage2(baseInput, mockAI);

      expect(result.kind).toBe("anomaly");
      if (result.kind === "anomaly") {
        expect(result.reason).toBe("无法识别金额");
      }
    });

    it("should arbitrate when GPTs disagree", async () => {
      let callCount = 0;
      const mockAI: AIContext = {
        generate: vi.fn(async (_opts: AIGenerateOptions): Promise<AIResponse> => {
          callCount++;
          if (callCount === 1) {
            return {
              content: JSON.stringify({
                outcome: "success",
                title: "午餐",
                ledger_entries: [
                  { item_name: "午餐", amount: 45, currency: "CNY", category_index: 1, entry_date: "2026-02-05", notes: null },
                ],
                reasoning: "result1",
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          if (callCount === 2) {
            return {
              content: JSON.stringify({
                outcome: "success",
                title: "午饭",
                ledger_entries: [
                  { item_name: "午饭", amount: 50, currency: "CNY", category_index: 1, entry_date: "2026-02-05", notes: null },
                ],
                reasoning: "result2",
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          // Arbitration call
          return {
            content: JSON.stringify({ choice: 1, reason: "result1 is more accurate" }),
            usage: { promptTokens: 100, completionTokens: 50 },
          };
        }),
      };

      const result = await executeStage2(baseInput, mockAI);

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.output.wasArbitrated).toBe(true);
        expect(result.output.entries[0]?.amount).toBe(45);
      }
      expect(mockAI.generate).toHaveBeenCalledTimes(3);
    });

    it("should return anomaly when arbitrator picks choice 0", async () => {
      let callCount = 0;
      const mockAI: AIContext = {
        generate: vi.fn(async (_opts: AIGenerateOptions): Promise<AIResponse> => {
          callCount++;
          if (callCount <= 2) {
            return {
              content: JSON.stringify({
                outcome: "success",
                title: "Test",
                ledger_entries: [
                  { item_name: "Item", amount: callCount * 10, currency: "CNY", category_index: 1, notes: null },
                ],
                reasoning: `result${callCount}`,
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          return {
            content: JSON.stringify({ choice: 0, reason: "Both fundamentally flawed" }),
            usage: { promptTokens: 100, completionTokens: 50 },
          };
        }),
      };

      const result = await executeStage2(baseInput, mockAI);

      expect(result.kind).toBe("anomaly");
    });
  });

  describe("AI tier usage", () => {
    it("should use text tier for parsing and arbitration", async () => {
      let callCount = 0;
      const mockAI: AIContext = {
        generate: vi.fn(async (opts: AIGenerateOptions): Promise<AIResponse> => {
          callCount++;
          if (callCount <= 2) {
            expect(opts.model).toBe("text");
            return {
              content: JSON.stringify({
                outcome: "success",
                title: "Test",
                ledger_entries: [
                  { item_name: "a", amount: callCount * 10, currency: "CNY", category_index: 1, entry_date: "2026-02-05", notes: null },
                ],
                reasoning: "x",
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          expect(opts.model).toBe("text");
          return {
            content: JSON.stringify({ choice: 1, reason: "ok" }),
            usage: { promptTokens: 100, completionTokens: 50 },
          };
        }),
      };

      await executeStage2(baseInput, mockAI);

      expect(mockAI.generate).toHaveBeenCalledTimes(3);
    });
  });
});
