import { describe, it, expect, vi, beforeEach } from "vitest";
import { categorizeEntryHandler, type CategorizeEntryInput } from "@/features/ledger/server/tasks/categorize-entry";
import { getTestDb } from "../../../setup";
import { ledgerEntries, entryCategories } from "@/lib/db/schema";
import { sourceDocuments } from "@/features/source-document/server/schema";
import { eq } from "drizzle-orm";
import { type FlowContext, type AIContext, type AIGenerateOptions, type AIResponse } from "@/lib/flow";
import { createTestUserWithLedger } from "../../../helpers/schema-setup";
import { v4 as uuidv4 } from "uuid";

function createMockAI(categoryIndex: number, confidence = 0.9): AIContext {
    return {
        generate: vi.fn(async (_opts: AIGenerateOptions): Promise<AIResponse> => ({
            content: JSON.stringify({
                category_index: categoryIndex,
                confidence,
                reasoning: "Test reasoning",
            }),
            usage: { promptTokens: 50, completionTokens: 20 },
        })),
    } as unknown as AIContext;
}

function createMockContext(ai: AIContext, aborted = false): FlowContext {
    return {
        ai,
        signal: { aborted } as AbortSignal,
        updateProgress: vi.fn(),
        reportTokens: vi.fn(),
        taskId: "test-task-id",
    } as unknown as FlowContext;
}

const baseCategories = [
    { id: "cat-1", index: 1, name: "餐饮", description: "食物相关" },
    { id: "cat-2", index: 2, name: "交通", description: "出行相关" },
];

const baseInput: CategorizeEntryInput = {
    ledgerId: "test-ledger-id",
    entryId: "test-entry-id",
    itemName: "午餐",
    amount: "25.00",
    currency: "CNY",
    description: null,
    entryDate: "2024-01-15",
    categories: baseCategories,
    aiLanguage: "zh-CN",
};

describe("categorizeEntryHandler.execute", () => {
    it("returns correct categoryIndex when AI matches a category", async () => {
        const ai = createMockAI(1);
        const ctx = createMockContext(ai);

        const result = await categorizeEntryHandler.execute(baseInput, ctx);
        expect(result.categoryIndex).toBe(1);
        expect(result.confidence).toBe(0.9);
        expect(result.reasoning).toBe("Test reasoning");
    });

    it("returns categoryIndex=0 when AI finds no match", async () => {
        const ai = createMockAI(0);
        const ctx = createMockContext(ai);

        const result = await categorizeEntryHandler.execute(baseInput, ctx);
        expect(result.categoryIndex).toBe(0);
    });

    it("throws 'Task cancelled' when signal is aborted", async () => {
        const ai = createMockAI(1);
        const ctx = createMockContext(ai, true);

        await expect(categorizeEntryHandler.execute(baseInput, ctx)).rejects.toThrow(
            "Task cancelled"
        );
        expect(ai.generate).not.toHaveBeenCalled();
    });

    it("throws on JSON parse failure", async () => {
        const ai = {
            generate: vi.fn(async (): Promise<AIResponse> => ({
                content: "not valid json at all",
                usage: { promptTokens: 10, completionTokens: 5 },
            })),
        } as unknown as AIContext;
        const ctx = createMockContext(ai);

        await expect(categorizeEntryHandler.execute(baseInput, ctx)).rejects.toThrow();
    });

    it("includes sourceDocumentText in message content when provided", async () => {
        const ai = createMockAI(1);
        const ctx = createMockContext(ai);

        const input: CategorizeEntryInput = {
            ...baseInput,
            sourceDocumentText: "Receipt from restaurant",
        };

        await categorizeEntryHandler.execute(input, ctx);

        const callArgs = vi.mocked(ai.generate).mock.calls[0][0];
        const messages = callArgs.messages as Array<{ role: string; content: unknown[] }>;
        const content = messages[0].content as Array<{ type: string; text?: string }>;
        const textParts = content.filter(c => c.type === "text");
        expect(textParts.some(p => p.text?.includes("Receipt from restaurant"))).toBe(true);
    });

    it("includes imageUrls in message content when provided", async () => {
        const ai = createMockAI(1);
        const ctx = createMockContext(ai);

        const input: CategorizeEntryInput = {
            ...baseInput,
            sourceDocumentImageUrls: ["https://example.com/receipt.jpg"],
        };

        await categorizeEntryHandler.execute(input, ctx);

        const callArgs = vi.mocked(ai.generate).mock.calls[0][0];
        const messages = callArgs.messages as Array<{ role: string; content: unknown[] }>;
        const content = messages[0].content as Array<{ type: string; image_url?: { url: string } }>;
        const imageParts = content.filter(c => c.type === "image_url");
        expect(imageParts).toHaveLength(1);
        expect(imageParts[0].image_url?.url).toBe("https://example.com/receipt.jpg");
    });

    it("falls back to 'No additional context' when no source doc provided", async () => {
        const ai = createMockAI(1);
        const ctx = createMockContext(ai);

        await categorizeEntryHandler.execute(baseInput, ctx);

        const callArgs = vi.mocked(ai.generate).mock.calls[0][0];
        const messages = callArgs.messages as Array<{ role: string; content: unknown[] }>;
        const content = messages[0].content as Array<{ type: string; text?: string }>;
        expect(content).toHaveLength(1);
        expect(content[0].text).toContain("No additional context");
    });
});

describe("categorizeEntryHandler.onComplete", () => {
    let ledgerId: string;
    let entryId: string;

    beforeEach(async () => {
        const db = getTestDb();
        const { ledgerId: lid } = await createTestUserWithLedger(db);
        ledgerId = lid;

        // Create category
        await db.insert(entryCategories).values({
            id: "cat-1",
            ledgerId,
            name: "餐饮",
            sortOrder: 1,
        });

        // Create source doc + entry
        const [doc] = await db.insert(sourceDocuments).values({
            id: uuidv4(),
            ledgerId,
            text: "test",
            status: "completed",
            type: "ai_parsed",
            imageUrls: [],
        }).returning();

        const [entry] = await db.insert(ledgerEntries).values({
            id: uuidv4(),
            ledgerId,
            sourceDocumentId: doc.id,
            itemName: "午餐",
            amount: "25.00",
            currency: "CNY",
            categoryId: null,
        }).returning();

        entryId = entry.id;
    });

    it("updates entry categoryId when AI returns valid category_index", async () => {
        const db = getTestDb();
        const input: CategorizeEntryInput = {
            ...baseInput,
            ledgerId,
            entryId,
            categories: [{ id: "cat-1", index: 1, name: "餐饮", description: null }],
        };
        const output = { categoryIndex: 1, confidence: 0.9, reasoning: "Food" };
        const ctx = createMockContext(createMockAI(1));

        await categorizeEntryHandler.onComplete(output, input, ctx);

        const updated = await db.query.ledgerEntries.findFirst({
            where: eq(ledgerEntries.id, entryId),
        });
        expect(updated?.categoryId).toBe("cat-1");
    });

    it("does not update entry when categoryIndex=0", async () => {
        const db = getTestDb();
        const input: CategorizeEntryInput = {
            ...baseInput,
            ledgerId,
            entryId,
            categories: [{ id: "cat-1", index: 1, name: "餐饮", description: null }],
        };
        const output = { categoryIndex: 0, confidence: 0.1, reasoning: "No match" };
        const ctx = createMockContext(createMockAI(0));

        await categorizeEntryHandler.onComplete(output, input, ctx);

        const entry = await db.query.ledgerEntries.findFirst({
            where: eq(ledgerEntries.id, entryId),
        });
        expect(entry?.categoryId).toBeNull();
    });

    it("does not update entry when categoryIndex exceeds categories length", async () => {
        const db = getTestDb();
        const input: CategorizeEntryInput = {
            ...baseInput,
            ledgerId,
            entryId,
            categories: [{ id: "cat-1", index: 1, name: "餐饮", description: null }],
        };
        const output = { categoryIndex: 99, confidence: 0.5, reasoning: "Out of range" };
        const ctx = createMockContext(createMockAI(99));

        await categorizeEntryHandler.onComplete(output, input, ctx);

        const entry = await db.query.ledgerEntries.findFirst({
            where: eq(ledgerEntries.id, entryId),
        });
        expect(entry?.categoryId).toBeNull();
    });
});

describe("categorizeEntryHandler.onError", () => {
    it("does not throw and keeps categoryId as null", async () => {
        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db);

        const [doc] = await db.insert(sourceDocuments).values({
            id: uuidv4(),
            ledgerId,
            text: "test",
            status: "completed",
            type: "ai_parsed",
            imageUrls: [],
        }).returning();

        const [entry] = await db.insert(ledgerEntries).values({
            id: uuidv4(),
            ledgerId,
            sourceDocumentId: doc.id,
            itemName: "午餐",
            amount: "25.00",
            currency: "CNY",
            categoryId: null,
        }).returning();

        const input: CategorizeEntryInput = {
            ...baseInput,
            ledgerId,
            entryId: entry.id,
        };
        const ctx = createMockContext(createMockAI(0));

        await expect(
            categorizeEntryHandler.onError(new Error("AI failed"), input, ctx)
        ).resolves.not.toThrow();

        const unchanged = await db.query.ledgerEntries.findFirst({
            where: eq(ledgerEntries.id, entry.id),
        });
        expect(unchanged?.categoryId).toBeNull();
    });
});
