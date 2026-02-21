import { describe, it, expect, vi } from "vitest";
import { executeStage1_5Validation, type ValidationInput } from "@/features/source-document/server/tasks/stage1-5-validator";
import type { AIContext, AIGenerateOptions, AIResponse } from "@/lib/flow/types";
import type { Stage1Results } from "@/features/source-document/server/tasks/types";

// Helper to create mock AI context
function createMockAI(response: string): AIContext {
    return {
        generate: vi.fn(async (_options: AIGenerateOptions): Promise<AIResponse> => {
            return { content: response, usage: { promptTokens: 100, completionTokens: 50 } };
        }),
    };
}

describe("Stage 1.5 Validator", () => {
    const baseStage1Results: Stage1Results = {
        validity: { is_valid: true, reasoning: "Found amount" },
        currency: { currencies: ["CNY"], reasoning: "¥ symbol found" },
        category: { categories: ["餐饮"], reasoning: "Food items" },
        title: { title: "午餐" },
    };

    const baseInput: ValidationInput = {
        text: "午餐 ¥45",
        imageUrls: [],
        aiLanguage: "zh-CN",
        stage1Results: baseStage1Results,
    };

    describe("Reasonable Results", () => {
        it("should return is_reasonable true with summary when results are consistent", async () => {
            const mockAI = createMockAI(JSON.stringify({
                is_reasonable: true,
                summary: {
                    title: "午餐消费",
                    currencies: [{ code: "CNY", hint: "金额前有¥符号" }],
                    categories: [{ name: "餐饮", hint: "包含午餐食物" }],
                },
            }));

            const result = await executeStage1_5Validation(baseInput, mockAI);

            expect(result.is_reasonable).toBe(true);
            expect(result.summary).toBeDefined();
            expect(result.summary?.title).toBe("午餐消费");
            expect(result.summary?.currencies[0].code).toBe("CNY");
            expect(result.summary?.categories[0].name).toBe("餐饮");
        });

        it("should include user rules in summary when present", async () => {
            const inputWithRules: ValidationInput = {
                ...baseInput,
                stage1Results: {
                    ...baseStage1Results,
                    userRequirements: { rules: ["合并餐饮项目"] },
                },
            };

            const mockAI = createMockAI(JSON.stringify({
                is_reasonable: true,
                summary: {
                    title: "午餐",
                    currencies: [{ code: "CNY", hint: "¥符号" }],
                    categories: [{ name: "餐饮", hint: "食物" }],
                    rules: ["合并餐饮项目"],
                },
            }));

            const result = await executeStage1_5Validation(inputWithRules, mockAI);

            expect(result.summary?.rules).toEqual(["合并餐饮项目"]);
        });
    });

    describe("Unreasonable Results (Veto)", () => {
        it("should return is_reasonable false with rejection_reason when results are inconsistent", async () => {
            const mockAI = createMockAI(JSON.stringify({
                is_reasonable: false,
                rejection_reason: "Currency identified as CNY but document shows $ symbol",
            }));

            const result = await executeStage1_5Validation(baseInput, mockAI);

            expect(result.is_reasonable).toBe(false);
            expect(result.rejection_reason).toBe("Currency identified as CNY but document shows $ symbol");
            expect(result.summary).toBeUndefined();
        });
    });

    describe("API Call", () => {
        it("should call AI with correct prompt structure", async () => {
            const mockAI = createMockAI(JSON.stringify({
                is_reasonable: true,
                summary: {
                    title: "午餐",
                    currencies: [{ code: "CNY", hint: "符号" }],
                    categories: [{ name: "餐饮", hint: "食物" }],
                },
            }));

            await executeStage1_5Validation(baseInput, mockAI);

            expect(mockAI.generate).toHaveBeenCalledTimes(1);
            const callArgs = (mockAI.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
            expect(callArgs.prompt).toContain("validation AI");
            expect(callArgs.prompt).toContain("Stage 1 Results");
            expect(callArgs.responseFormat).toBe("json_object");
            expect(callArgs.model).toBe('smart');
        });
    });
});
