import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateCategoryMetadataHandler, GenerateCategoryMetadataInput, GenerateCategoryMetadataOutput } from "@/features/ledger/server/tasks/generate-category-metadata";
import { getTestDb } from "../../../setup";
import { entryCategories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { FlowContext } from "@/lib/flow";
import { createTestUserWithLedger } from "../../../helpers/schema-setup";

// Mock OpenAI
const mockGenerateContent = vi.fn();
vi.mock("@/features/ai/server/services/openai", () => ({
    getOpenAIClient: () => ({
        generateContent: mockGenerateContent
    })
}));

describe("generateCategoryMetadataHandler", () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("execute", () => {
        it("should parse valid JSON response and return icon/description", async () => {
            const input: GenerateCategoryMetadataInput = {
                categoryId: "cat-1",
                categoryName: "宠物",
                existingCategories: [],
                aiLanguage: "zh-CN"
            };

            mockGenerateContent.mockResolvedValue({
                content: JSON.stringify({
                    icon: "Dog",
                    description: "宠物相关的支出"
                })
            });

            const context = { ledgerId: "ledger-1" } as FlowContext;
            const result = await generateCategoryMetadataHandler.execute(input, context) as GenerateCategoryMetadataOutput;

            expect(result.success).toBe(true);
            expect(result.icon).toBe("Dog");
            expect(result.description).toBe("宠物相关的支出");
        });

        it("should fallback to Package icon if AI returns invalid icon", async () => {
            const input: GenerateCategoryMetadataInput = {
                categoryId: "cat-1",
                categoryName: "奇怪的东西",
                existingCategories: [],
            };

            mockGenerateContent.mockResolvedValue({
                content: JSON.stringify({
                    icon: "NonExistentIconXYZ",
                    description: "Description"
                })
            });

            const context = { ledgerId: "ledger-1" } as FlowContext;
            const result = await generateCategoryMetadataHandler.execute(input, context) as GenerateCategoryMetadataOutput;

            expect(result.icon).toBe("Package");
        });

        it("should handle JSON parsing errors", async () => {
            const input: GenerateCategoryMetadataInput = {
                categoryId: "cat-1",
                categoryName: "Bad JSON",
                existingCategories: [],
            };

            mockGenerateContent.mockResolvedValue({ content: "Not JSON" });

            const context = { ledgerId: "ledger-1" } as FlowContext;
            const result = await generateCategoryMetadataHandler.execute(input, context) as GenerateCategoryMetadataOutput;

            expect(result.success).toBe(false);
            expect(result.icon).toBe("Package");
        });
    });

    describe("onComplete", () => {
        it("should update category in database", async () => {
            const db = getTestDb();
            const { ledgerId } = await createTestUserWithLedger(db, "test-cat-ai@example.com", "AI Ledger");
            const [category] = await db.insert(entryCategories).values({
                ledgerId,
                name: "Testing",
            }).returning();

            const output: GenerateCategoryMetadataOutput = {
                icon: "Rocket",
                description: "AI Generated Description",
                success: true
            };

            const input: GenerateCategoryMetadataInput = {
                categoryId: category.id,
                categoryName: "Testing",
                existingCategories: []
            };

            const context = { ledgerId } as FlowContext;

            if (generateCategoryMetadataHandler.onComplete) {
                await generateCategoryMetadataHandler.onComplete(output, input, context);
            }

            const updated = await db.query.entryCategories.findFirst({
                where: eq(entryCategories.id, category.id)
            });

            expect(updated?.icon).toBe("Rocket");
            expect(updated?.description).toBe("AI Generated Description");
        });
    });
});
