import { describe, it, expect, vi } from "vitest";
import {
  executeStage2,
  type Stage2Input,
} from "@/features/source-document/server/tasks/stage2-executor";
import type { AIContext, AIGenerateOptions, AIResponse } from "@/lib/flow/types";
import type { ValidationSummary } from "@/features/source-document/server/tasks/types";

describe("Stage 2 Executor", () => {
  const baseValidationSummary: ValidationSummary = {
    is_reasonable: true,
    summary: {
      title: "午餐消费",
      currencies: [{ code: "CNY", hint: "¥符号" }],
      categories: [{ name: "餐饮", hint: "食物消费" }],
    },
  };

  const baseInput: Stage2Input = {
    text: "午餐 ¥45",
    imageUrls: [],
    aiLanguage: "zh-CN",
    validationSummary: baseValidationSummary,
    originalCategories: [
      { name: "餐饮", description: "食物消费" },
      { name: "交通", description: "出行费用" },
    ],
  };

  describe("Dual GPT Agreement", () => {
    it("should return entries when both GPTs agree", async () => {
      const mockResponse = JSON.stringify({
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

      const mockAI: AIContext = {
        generate: vi.fn(
          async (_opts: AIGenerateOptions): Promise<AIResponse> => ({
            content: mockResponse,
            usage: { promptTokens: 100, completionTokens: 50 },
          })
        ),
      };

      const result = await executeStage2(baseInput, mockAI);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].item_name).toBe("午餐");
      expect(result.entries[0].amount).toBe(45);
      expect(result.title).toBe("午餐消费");
      expect(result.wasArbitrated).toBe(false);
    });
  });

  describe("Date Handling", () => {
    it("should preserve dates from AI parsing results", async () => {
      const mockResponse = JSON.stringify({
        ledger_entries: [
          {
            item_name: "午餐",
            amount: 45,
            currency: "CNY",
            category_index: 1,
            entry_date: "2026-01-15", // Date from document
            notes: null,
          },
        ],
        reasoning: "item",
      });

      const mockAI: AIContext = {
        generate: vi.fn(
          async (): Promise<AIResponse> => ({
            content: mockResponse,
            usage: { promptTokens: 100, completionTokens: 50 },
          })
        ),
      };

      const result = await executeStage2(baseInput, mockAI);

      // Date should be preserved from AI result (not overridden to today)
      expect(result.entries[0].entry_date).toBe("2026-01-15");
    });
  });

  describe("Arbitration", () => {
    it("should invoke arbitration when GPTs disagree", async () => {
      let callCount = 0;
      const mockAI: AIContext = {
        generate: vi.fn(async (opts: AIGenerateOptions): Promise<AIResponse> => {
          callCount++;
          const prompt = opts.prompt ?? "";

          // First two calls are dual GPT parsing
          if (callCount === 1) {
            return {
              content: JSON.stringify({
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
                reasoning: "a",
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          if (callCount === 2) {
            return {
              content: JSON.stringify({
                ledger_entries: [
                  {
                    item_name: "午餐",
                    amount: 50,
                    currency: "CNY",
                    category_index: 1,
                    entry_date: "2026-02-05",
                    notes: null,
                  },
                ],
                reasoning: "b",
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          // Third call is arbitration
          if (prompt.includes("arbitration") ?? false) {
            return {
              content: JSON.stringify({ choice: 1, reason: "First is correct" }),
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          return { content: "{}", usage: { promptTokens: 100, completionTokens: 50 } };
        }),
      };

      const result = await executeStage2(baseInput, mockAI);

      expect(result.wasArbitrated).toBe(true);
      expect(result.entries[0].amount).toBe(45);
    });

    it("should throw when arbitration returns choice 0", async () => {
      let callCount = 0;
      const mockAI: AIContext = {
        generate: vi.fn(async (opts: AIGenerateOptions): Promise<AIResponse> => {
          callCount++;
          const prompt = opts.prompt ?? "";

          if (callCount === 1) {
            return {
              content: JSON.stringify({
                ledger_entries: [
                  {
                    item_name: "a",
                    amount: 10,
                    currency: "CNY",
                    category_index: 1,
                    entry_date: "2026-02-05",
                    notes: null,
                  },
                ],
                reasoning: "a",
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          if (callCount === 2) {
            return {
              content: JSON.stringify({
                ledger_entries: [
                  {
                    item_name: "b",
                    amount: 20,
                    currency: "USD",
                    category_index: 2,
                    entry_date: "2026-02-05",
                    notes: null,
                  },
                ],
                reasoning: "b",
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          if (prompt.includes("arbitration") ?? false) {
            return {
              content: JSON.stringify({ choice: 0, reason: "Both wrong" }),
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          return { content: "{}", usage: { promptTokens: 100, completionTokens: 50 } };
        }),
      };

      await expect(executeStage2(baseInput, mockAI)).rejects.toThrow("STAGE2_ARBITRATION_FAILED");
    });
  });

  describe("API Configuration", () => {
    it("should use fast tier for parsing and smart tier for arbitration", async () => {
      let callCount = 0;
      const mockAI: AIContext = {
        generate: vi.fn(async (opts: AIGenerateOptions): Promise<AIResponse> => {
          callCount++;
          if (callCount <= 2) {
            // Parsing calls should use text tier
            expect(opts.model).toBe("text");
            return {
              content: JSON.stringify({
                ledger_entries: [
                  {
                    item_name: "a",
                    amount: callCount * 10,
                    currency: "CNY",
                    category_index: 1,
                    entry_date: "2026-02-05",
                    notes: null,
                  },
                ],
                reasoning: "x",
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          // Arbitration should use text tier
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
