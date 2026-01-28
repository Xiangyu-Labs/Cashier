
import { buildTransactionPrompt, buildSummarizationPrompt } from "@/lib/ai/prompts";
import { CategoryInfo } from "@/lib/message-processor/types";

describe("GPT Prompts", () => {
    describe("buildTransactionPrompt", () => {
        const categories: CategoryInfo[] = [
            { id: "1", name: "餐饮", description: "Meals and drinks" },
            { id: "2", name: "交通", description: "Transport" },
        ];

        it("should include category list in the prompt", () => {
            const prompt = buildTransactionPrompt(categories, "zh-CN", "2025-01-28");
            expect(prompt).toContain("1. 餐饮 - Meals and drinks");
            expect(prompt).toContain("2. 交通 - Transport");
        });

        it("should include the current date", () => {
            const prompt = buildTransactionPrompt(categories, "zh-CN", "2025-01-28");
            expect(prompt).toContain("- **Current Date**: 2025-01-28");
        });

        it("should request descriptive titles", () => {
            const prompt = buildTransactionPrompt(categories);
            expect(prompt).toContain(`"title": "Short and descriptive bill title`);
        });

        it("should include core rules about splitting and currency", () => {
            const prompt = buildTransactionPrompt(categories);
            expect(prompt).toContain("**Splitting Principle**: If it's a shopping receipt");
            expect(prompt).toContain("**Currency Identification**: Prioritize currency from content");
        });
    });

    describe("buildSummarizationPrompt", () => {
        const items = [
            { itemName: "Item 1", amount: 10, notes: "Note 1" },
            { itemName: "Item 2", amount: 20 },
        ];

        it("should include the items JSON", () => {
            const prompt = buildSummarizationPrompt(items);
            expect(prompt).toContain('"itemName": "Item 1"');
            expect(prompt).toContain('"amount": 10');
            expect(prompt).toContain('"itemName": "Item 2"');
        });

        it("should allow longer summaries (10 chars)", () => {
            const prompt = buildSummarizationPrompt(items);
            expect(prompt).toContain("**Limit**: Under 10 characters");
        });

        it("should ask for deduping notes", () => {
            const prompt = buildSummarizationPrompt(items);
            expect(prompt).toContain("**Deduplicate and Simplify**: If there are multiple identical notes");
        });
    });
});
