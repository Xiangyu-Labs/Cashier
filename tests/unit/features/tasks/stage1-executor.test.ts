import { describe, it, expect, vi } from "vitest";
import {
  executeStage1,
  type Stage1Input,
} from "@/features/source-document/server/tasks/stage1-executor";
import type { AIContext, AIGenerateOptions, AIResponse } from "@/lib/flow/types";

// Helper to create mock AI context
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

describe("Stage 1 Executor", () => {
  const baseInput: Stage1Input = {
    text: "午餐 45元",
    imageUrls: [],
    aiLanguage: "zh-CN",
    preferredCurrencies: ["CNY", "USD"],
    categories: [
      { name: "餐饮", description: "日常餐饮消费" },
      { name: "交通", description: "日常交通出行" },
      { name: "其他", description: null },
    ],
    aiCustomPrompt: "",
  };

  describe("Validity Check", () => {
    it("should return isValid false when document is invalid", async () => {
      const mockAI = createMockAI([
        // Validity check (dual GPT) - runs in parallel with title
        '{"is_valid": false, "reasoning": "无法识别金额"}',
        '{"is_valid": false, "reasoning": "无法识别金额"}',
        // Title extraction (single GPT) - runs in parallel with validity
        '{"title": "无效文档"}',
      ]);

      const result = await executeStage1(baseInput, mockAI);

      expect(result.isValid).toBe(false);
      expect("title" in result ? result.title : undefined).toBe("无效文档");
      // 2 calls for validity check (dual GPT) + 1 call for title
      expect(mockAI.generate).toHaveBeenCalledTimes(3);
    });

    it("should continue to other tasks when valid", async () => {
      const mockAI = createMockAI([
        // Validity check (dual GPT) - runs in parallel with title
        '{"is_valid": true, "reasoning": "识别到金额45元"}',
        '{"is_valid": true, "reasoning": "识别到金额45元"}',
        // Title extraction (single GPT) - runs in parallel with validity
        '{"title": "午餐消费"}',
        // Completeness check (single GPT)
        '{"is_complete": true}',
        // Currency (dual GPT)
        '{"currencies": ["CNY"], "reasoning": "金额前有元符号"}',
        '{"currencies": ["CNY"], "reasoning": "金额前有元符号"}',
        // Category (dual GPT)
        '{"categories": ["餐饮"], "reasoning": "午餐是餐饮消费"}',
        '{"categories": ["餐饮"], "reasoning": "午餐是餐饮消费"}',
      ]);

      const result = await executeStage1(baseInput, mockAI);

      expect(result.isValid).toBe(true);
      if (result.isValid && !result.isIncomplete) {
        expect(result.results.validity.is_valid).toBe(true);
        expect(result.results.currency.currencies).toEqual(["CNY"]);
        expect(result.results.category.categories).toEqual(["餐饮"]);
        expect(result.results.title.title).toBe("午餐消费");
        expect(result.results.userRequirements).toBeUndefined();
      }
    });
  });

  describe("Dual GPT Agreement", () => {
    it("should use first result when both GPTs agree", async () => {
      const mockAI = createMockAI([
        // Validity check (dual GPT) - runs in parallel with title
        '{"is_valid": true, "reasoning": "GPT1 reasoning"}',
        '{"is_valid": true, "reasoning": "GPT2 reasoning"}',
        // Title extraction (single GPT) - runs in parallel with validity
        '{"title": "午餐"}',
        // Completeness check (single GPT)
        '{"is_complete": true}',
        // Currency (dual GPT)
        '{"currencies": ["CNY"], "reasoning": "GPT1 currency reason"}',
        '{"currencies": ["CNY"], "reasoning": "GPT2 currency reason"}',
        // Category (dual GPT)
        '{"categories": ["餐饮"], "reasoning": "agreed"}',
        '{"categories": ["餐饮"], "reasoning": "agreed"}',
      ]);

      const result = await executeStage1(baseInput, mockAI);

      expect(result.isValid).toBe(true);
      if (result.isValid && !result.isIncomplete) {
        // Should use GPT1's reasoning
        expect(result.results.currency.reasoning).toBe("GPT1 currency reason");
      }
    });
  });

  describe("Arbitration", () => {
    it("should invoke arbitration when GPTs disagree on currency", async () => {
      // Use smart mock that returns responses based on prompt content
      let currencyCallCount = 0;
      const mockAI: AIContext = {
        generate: vi.fn(async (options: AIGenerateOptions): Promise<AIResponse> => {
          const prompt = options.prompt ?? "";

          if (prompt.includes("financial document validation") ?? false) {
            return {
              content: '{"is_valid": true, "reasoning": "valid"}',
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          if (prompt.includes("completeness checker") ?? false) {
            return {
              content: '{"is_complete": true}',
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          if (prompt.includes("currency recognition") ?? false) {
            currencyCallCount++;
            if (currencyCallCount === 1) {
              return {
                content: '{"currencies": ["CNY"], "reasoning": "Chinese yuan"}',
                usage: { promptTokens: 100, completionTokens: 50 },
              };
            } else {
              return {
                content: '{"currencies": ["USD"], "reasoning": "US dollar"}',
                usage: { promptTokens: 100, completionTokens: 50 },
              };
            }
          }
          if (prompt.includes("arbitration") ?? false) {
            return {
              content: '{"choice": 1, "reason": "CNY is correct"}',
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          if (prompt.includes("category recognition") ?? false) {
            return {
              content: '{"categories": ["餐饮"], "reasoning": "food"}',
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          if (prompt.includes("title extraction") ?? false) {
            return {
              content: '{"title": "午餐"}',
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          return { content: "{}", usage: { promptTokens: 100, completionTokens: 50 } };
        }),
      };

      const result = await executeStage1(baseInput, mockAI);

      expect(result.isValid).toBe(true);
      if (result.isValid && !result.isIncomplete) {
        expect(result.results.currency.currencies).toEqual(["CNY"]);
      }
    });

    it("should throw when arbitration returns choice 0", async () => {
      let currencyCallCount = 0;
      const mockAI: AIContext = {
        generate: vi.fn(async (options: AIGenerateOptions): Promise<AIResponse> => {
          const prompt = options.prompt ?? "";

          if (prompt.includes("financial document validation") ?? false) {
            return {
              content: '{"is_valid": true, "reasoning": "valid"}',
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          if (prompt.includes("completeness checker") ?? false) {
            return {
              content: '{"is_complete": true}',
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          if (prompt.includes("currency recognition") ?? false) {
            currencyCallCount++;
            if (currencyCallCount === 1) {
              return {
                content: '{"currencies": ["CNY"], "reasoning": "a"}',
                usage: { promptTokens: 100, completionTokens: 50 },
              };
            } else {
              return {
                content: '{"currencies": ["USD"], "reasoning": "b"}',
                usage: { promptTokens: 100, completionTokens: 50 },
              };
            }
          }
          if (prompt.includes("arbitration") ?? false) {
            return {
              content: '{"choice": 0, "reason": "Both are wrong"}',
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          if (prompt.includes("category recognition") ?? false) {
            return {
              content: '{"categories": ["餐饮"], "reasoning": "r"}',
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          if (prompt.includes("title extraction") ?? false) {
            return {
              content: '{"title": "午餐"}',
              usage: { promptTokens: 100, completionTokens: 50 },
            };
          }
          return { content: "{}", usage: { promptTokens: 100, completionTokens: 50 } };
        }),
      };

      await expect(executeStage1(baseInput, mockAI)).rejects.toThrow("ARBITRATION_FAILED");
    });
  });

  describe("User Requirements", () => {
    it("should skip user requirements when aiCustomPrompt is empty", async () => {
      const mockAI = createMockAI([
        // Validity check (dual GPT) - runs in parallel with title
        '{"is_valid": true, "reasoning": "valid"}',
        '{"is_valid": true, "reasoning": "valid"}',
        // Title extraction (single GPT) - runs in parallel with validity
        '{"title": "午餐"}',
        // Completeness check (single GPT)
        '{"is_complete": true}',
        // Currency (dual GPT)
        '{"currencies": ["CNY"], "reasoning": "r"}',
        '{"currencies": ["CNY"], "reasoning": "r"}',
        // Category (dual GPT)
        '{"categories": ["餐饮"], "reasoning": "r"}',
        '{"categories": ["餐饮"], "reasoning": "r"}',
      ]);

      const result = await executeStage1({ ...baseInput, aiCustomPrompt: "" }, mockAI);

      expect(result.isValid).toBe(true);
      if (result.isValid && !result.isIncomplete) {
        expect(result.results.userRequirements).toBeUndefined();
      }
    });

    it("should process user requirements when aiCustomPrompt is provided", async () => {
      const mockAI = createMockAI([
        // Validity check (dual GPT) - runs in parallel with title
        '{"is_valid": true, "reasoning": "valid"}',
        '{"is_valid": true, "reasoning": "valid"}',
        // Title extraction (single GPT) - runs in parallel with validity
        '{"title": "午餐"}',
        // Completeness check (single GPT)
        '{"is_complete": true}',
        // Currency (dual GPT)
        '{"currencies": ["CNY"], "reasoning": "r"}',
        '{"currencies": ["CNY"], "reasoning": "r"}',
        // Category (dual GPT)
        '{"categories": ["餐饮"], "reasoning": "r"}',
        '{"categories": ["餐饮"], "reasoning": "r"}',
        // User requirements (single GPT) - only when aiCustomPrompt is provided
        '{"rules": ["合并餐饮项目"]}',
      ]);

      const result = await executeStage1(
        { ...baseInput, aiCustomPrompt: "把餐饮类的都合并成一条" },
        mockAI
      );

      expect(result.isValid).toBe(true);
      if (result.isValid && !result.isIncomplete) {
        expect(result.results.userRequirements).toBeDefined();
        expect(result.results.userRequirements?.rules).toEqual(["合并餐饮项目"]);
      }
    });
  });

  describe("Cancellation", () => {
    it("should throw when signal is aborted after validity check", async () => {
      const controller = new AbortController();
      const mockAI = createMockAI([
        // Validity check (dual GPT) - runs in parallel with title
        '{"is_valid": true, "reasoning": "valid"}',
        '{"is_valid": true, "reasoning": "valid"}',
        // Title extraction (single GPT) - runs in parallel with validity
        '{"title": "测试文档"}',
      ]);

      // Abort after validity/title check (first batch of parallel calls)
      const originalGenerate = mockAI.generate;
      let callCount = 0;
      mockAI.generate = vi.fn(async (options: AIGenerateOptions) => {
        callCount++;
        if (callCount === 3) {
          controller.abort();
        }
        return originalGenerate(options);
      });

      await expect(executeStage1(baseInput, mockAI, controller.signal)).rejects.toThrow(
        "Task cancelled"
      );
    });
  });
});
