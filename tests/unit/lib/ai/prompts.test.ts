
import { buildLedgerEntryPrompt, buildSummarizationPrompt } from "@/features/ai/server/services/prompts";
import { CategoryInfo } from "@/features/ai/server/types";

describe("GPT Prompts", () => {
    describe("buildLedgerEntryPrompt", () => {
        const categories: CategoryInfo[] = [
            { id: "1", name: "餐饮", description: "Meals and drinks" },
            { id: "2", name: "交通", description: "Transport" },
        ];

        it("should include category list in the prompt", () => {
            const prompt = buildLedgerEntryPrompt(categories, "zh-CN", "2025-01-28");
            expect(prompt).toContain("- 餐饮: Meals and drinks");
            expect(prompt).toContain("- 交通: Transport");
        });

        it("should include the reference date", () => {
            const prompt = buildLedgerEntryPrompt(categories, "zh-CN", "2025-01-28");
            expect(prompt).toContain("- **Ref Date**: 2025-01-28");
        });

        it("should request descriptive titles", () => {
            const prompt = buildLedgerEntryPrompt(categories);
            expect(prompt).toContain(`title: string; // e.g. "7-11 - Breakfast"`);
        });

        it("should include core rules about splitting and currency", () => {
            const prompt = buildLedgerEntryPrompt(categories);
            expect(prompt).toContain("**Split**: Separate receipts");
            expect(prompt).toContain("`currency`: ONLY infer if obvious");
        });

        it("should include preferred currencies in the prompt", () => {
            const prompt = buildLedgerEntryPrompt(categories, "zh-CN", "2025-01-28", ["USD", "HKD"]);
            expect(prompt).toContain("- **Pref Currencies**: USD, HKD");
        });

        it("should show 'None' when preferred currencies list is empty", () => {
            const prompt = buildLedgerEntryPrompt(categories, "zh-CN", "2025-01-28", []);
            expect(prompt).toContain("- **Pref Currencies**: None");
        });

        it("should include custom prompt when provided", () => {
            const customPrompt = "Include more emojis in titles";
            const prompt = buildLedgerEntryPrompt(categories, "zh-CN", "2025-01-28", [], customPrompt);
            expect(prompt).toContain("- **Custom Rules**: Include more emojis in titles");
        });

        it("should include target language instructions", () => {
            const prompt = buildLedgerEntryPrompt(categories, "en-US");
            expect(prompt).toContain("- **Target Lang**: en-US");
            expect(prompt).toContain("Translate 'title', 'item_name', 'notes' to Target Lang");
        });
    });

    describe("buildSummarizationPrompt", () => {
        const items = [
            { itemName: "Item 1", amount: 10, notes: "Note 1" },
            { itemName: "Item 2", amount: 20 },
        ];

        it("should include the items JSON", () => {
            const prompt = buildSummarizationPrompt(items);
            expect(prompt).toContain('"itemName":"Item 1"');
            expect(prompt).toContain('"amount":10');
            expect(prompt).toContain('"itemName":"Item 2"');
        });

        it("should allow longer summaries (10 chars)", () => {
            const prompt = buildSummarizationPrompt(items);
            expect(prompt).toContain("Concise (<10 chars) summary");
        });

        it("should ask for deduping notes", () => {
            const prompt = buildSummarizationPrompt(items);
            expect(prompt).toContain("Combine original notes/names. Deduplicate.");
        });
    });
});
