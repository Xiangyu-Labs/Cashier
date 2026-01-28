
import { buildTransactionPrompt, buildSummarizationPrompt } from "@/lib/ai/prompts";
import { CategoryInfo } from "@/lib/message-processor/types";

describe("GPT Prompts", () => {
    describe("buildTransactionPrompt", () => {
        const categories: CategoryInfo[] = [
            { name: "餐饮", description: "Meals and drinks" },
            { name: "交通", description: "Transport" },
        ];

        it("should include category list in the prompt", () => {
            const prompt = buildTransactionPrompt(categories, "2025-01-28");
            expect(prompt).toContain("1. 餐饮 - Meals and drinks");
            expect(prompt).toContain("2. 交通 - Transport");
        });

        it("should include the current date", () => {
            const prompt = buildTransactionPrompt(categories, "2025-01-28");
            expect(prompt).toContain("**当前日期**: 2025-01-28");
        });

        it("should request descriptive titles", () => {
            const prompt = buildTransactionPrompt(categories);
            expect(prompt).toContain(`"title": "简短且具有描述性的账单标题`);
        });

        it("should include core rules about splitting and currency", () => {
            const prompt = buildTransactionPrompt(categories);
            expect(prompt).toContain("**拆分原则**: 如果是购物小票或包含多个不同商品");
            expect(prompt).toContain("**货币识别**: 优先从内容中识别货币");
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
            expect(prompt).toContain("**字数限制**: 控制在 10 个字以内");
        });

        it("should ask for deduping notes", () => {
            const prompt = buildSummarizationPrompt(items);
            expect(prompt).toContain("**去重与精简**: 如果有多条相同的备注");
        });
    });
});
