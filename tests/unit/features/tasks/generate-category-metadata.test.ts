import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateCategoryMetadataHandler, type GenerateCategoryMetadataInput, type GenerateCategoryMetadataOutput } from "@/features/ledger/server/tasks/generate-category-metadata";
import { getTestDb } from "../../../setup";
import { entryCategories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { type FlowContext } from "@/lib/flow";
import { createTestUserWithLedger } from "../../../helpers/schema-setup";

describe("generateCategoryMetadataHandler", () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Helper to create a mock context with ai.generate
    function createMockContext(generateResponse: { content: string }) {
        return {
            ai: {
                generate: vi.fn().mockResolvedValue(generateResponse),
            },
        } as unknown as FlowContext;
    }

    describe("execute", () => {
        it("should parse valid JSON response and return icon/description", async () => {
            const input: GenerateCategoryMetadataInput = {
                ledgerId: "ledger-1",
                categoryId: "cat-1",
                categoryName: "宠物",
                existingCategories: [],
                aiLanguage: "zh-CN"
            };

            const context = createMockContext({
                content: JSON.stringify({
                    icon: "Dog",
                    description: "宠物相关的支出"
                })
            });
            const result = await generateCategoryMetadataHandler.execute(input, context) as GenerateCategoryMetadataOutput;

            expect(result.success).toBe(true);
            expect(result.icon).toBe("Dog");
            expect(result.description).toBe("宠物相关的支出");
        });

        it("should fallback to Package icon if AI returns invalid icon", async () => {
            const input: GenerateCategoryMetadataInput = {
                ledgerId: "ledger-1",
                categoryId: "cat-1",
                categoryName: "奇怪的东西",
                existingCategories: [],
            };

            const context = createMockContext({
                content: JSON.stringify({
                    icon: "NonExistentIconXYZ",
                    description: "Description"
                })
            });
            const result = await generateCategoryMetadataHandler.execute(input, context) as GenerateCategoryMetadataOutput;

            expect(result.icon).toBe("Package");
        });

        it("should throw on JSON parsing errors (triggers onError)", async () => {
            const input: GenerateCategoryMetadataInput = {
                ledgerId: "ledger-1",
                categoryId: "cat-1",
                categoryName: "Bad JSON",
                existingCategories: [],
            };

            const context = createMockContext({ content: "Not JSON" });

            // Should throw, not return success: false
            await expect(generateCategoryMetadataHandler.execute(input, context))
                .rejects.toThrow();
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
                ledgerId,
                categoryId: category.id,
                categoryName: "Testing",
                existingCategories: []
            };

            const context = {} as FlowContext;

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
