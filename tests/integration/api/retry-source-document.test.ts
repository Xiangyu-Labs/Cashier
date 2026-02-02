import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSourceDocumentAction, retrySourceDocumentAction } from "@/features/source-document/server/actions";
import { getTestDb } from "../../setup";
import { sourceDocuments, ledgerEntries, taskRuns, entryCategories as categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { MOCK_RESPONSES } from "../../helpers/mocks/openai";
import { getOpenAIClient } from "@/features/ai/server/services/openai";
import { processAllPendingTasks } from "../../helpers/processing";

// Mock OpenAI
vi.mock("@/features/ai/server/services/openai", () => ({
    getOpenAIClient: vi.fn(),
}));

describe("SourceDocument Retry Action", () => {
    let testLedgerId: string;
    let testCategoryId: string;

    beforeEach(async () => {
        // Reset mock to default
        vi.mocked(getOpenAIClient).mockReturnValue({
            generateContent: vi.fn().mockResolvedValue({ content: MOCK_RESPONSES.singleEntry }),
        } as unknown as ReturnType<typeof getOpenAIClient>);

        const db = getTestDb();
        const { ledgerId } = await createTestUserWithLedger(db, "test@example.com", "Test Ledger");
        testLedgerId = ledgerId;

        // Setup "餐饮" category
        const [category] = await db
            .insert(categories)
            .values({
                name: "餐饮",
                description: "餐饮服务",
                sortOrder: 1,
                ledgerId: testLedgerId,
            })
            .returning();
        testCategoryId = category.id;
    });

    it("should retry a document and re-process it", async () => {
        // 1. Create a document
        const createRes = await createSourceDocumentAction(testLedgerId, { text: "Lunch 25" });
        const docId = createRes.sourceDocumentId!;

        // Process it
        await processAllPendingTasks();

        const db = getTestDb();
        const docBefore = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, docId),
        });
        expect(docBefore?.status).toBe("completed");

        // 2. Call retry with new text
        const retryRes = await retrySourceDocumentAction(testLedgerId, docId, { text: "Dinner 50" });
        expect(retryRes.success).toBe(true);

        const docAfterRetry = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, docId),
        });
        expect(docAfterRetry?.status).toBe("queued");
        expect(docAfterRetry?.text).toBe("Dinner 50");

        // 3. Process tasks again
        await processAllPendingTasks();

        const docFinal = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, docId),
        });
        expect(docFinal?.status).toBe("completed");

        // Verify entries
        const entries = await db.query.ledgerEntries.findMany({
            where: eq(ledgerEntries.sourceDocumentId, docId),
        });

        // Should have active entries
        const activeEntries = entries.filter(e => !e.deletedAt);
        expect(activeEntries.length).toBeGreaterThan(0);

        // Should have soft-deleted entries (from the first run)
        const deletedEntries = entries.filter(e => e.deletedAt);
        expect(deletedEntries.length).toBeGreaterThan(0);
    });

    it("should retry an anomaly document", async () => {
        // 1. Simulate an anomaly
        const db = getTestDb();
        const [doc] = await db.insert(sourceDocuments).values({
            ledgerId: testLedgerId,
            status: "anomaly",
            text: "Invalid data",
            anomalyCodes: ["invalid_content"],
        }).returning();
        const docId = doc.id;

        // 2. Retry it
        const retryRes = await retrySourceDocumentAction(testLedgerId, docId, { text: "Fixed data" });
        expect(retryRes.success).toBe(true);

        const docAfterRetry = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, docId),
        });
        expect(docAfterRetry?.status).toBe("queued");

        // 3. Process
        await processAllPendingTasks();

        const docFinal = await db.query.sourceDocuments.findFirst({
            where: eq(sourceDocuments.id, docId),
        });

        expect(docFinal?.status).toBe("completed");
    });

    it("should replace old entries with new entries on retry", async () => {
        const db = getTestDb();

        // Mock first response: "午餐 25元"
        const firstResponse = JSON.stringify({
            is_valid: true,
            ledger_entries: [{
                item_name: "午餐",
                amount: 25,
                currency: "CNY",
                category: "餐饮",
                entry_date: "2025-01-25",
            }],
            title: "午餐消费",
        });

        // Mock second response: "晚餐 50元" (same category, different item and amount)
        const secondResponse = JSON.stringify({
            is_valid: true,
            ledger_entries: [{
                item_name: "晚餐",
                amount: 50,
                currency: "CNY",
                category: "餐饮",
                entry_date: "2025-01-25",
            }],
            title: "晚餐费用",
        });

        // First processing
        vi.mocked(getOpenAIClient).mockReturnValue({
            generateContent: vi.fn().mockResolvedValue({ content: firstResponse }),
        } as unknown as ReturnType<typeof getOpenAIClient>);

        const createRes = await createSourceDocumentAction(testLedgerId, { text: "午餐 25元" });
        const docId = createRes.sourceDocumentId!;
        await processAllPendingTasks();

        // Verify first entry
        const entriesBeforeRetry = await db.query.ledgerEntries.findMany({
            where: eq(ledgerEntries.sourceDocumentId, docId),
        });
        const activeBeforeRetry = entriesBeforeRetry.filter(e => !e.deletedAt);
        expect(activeBeforeRetry.length).toBe(1);
        expect(activeBeforeRetry[0].itemName).toBe("午餐");
        expect(activeBeforeRetry[0].amount).toBe("25.00");

        // Switch to second response for retry
        vi.mocked(getOpenAIClient).mockReturnValue({
            generateContent: vi.fn().mockResolvedValue({ content: secondResponse }),
        } as unknown as ReturnType<typeof getOpenAIClient>);

        // Retry with new text
        await retrySourceDocumentAction(testLedgerId, docId, { text: "晚餐 50元" });
        await processAllPendingTasks();

        // Verify entries after retry
        const entriesAfterRetry = await db.query.ledgerEntries.findMany({
            where: eq(ledgerEntries.sourceDocumentId, docId),
        });

        // Old entry should be soft-deleted
        const deletedEntries = entriesAfterRetry.filter(e => e.deletedAt);
        expect(deletedEntries.length).toBe(1);
        expect(deletedEntries[0].itemName).toBe("午餐");

        // New entry should be active
        const activeAfterRetry = entriesAfterRetry.filter(e => !e.deletedAt);
        expect(activeAfterRetry.length).toBe(1);
        expect(activeAfterRetry[0].itemName).toBe("晚餐");
        expect(activeAfterRetry[0].amount).toBe("50.00");
    });
});
